"""
Topic Clustering Module

BERTopic + HDBSCAN implementation for automatic pattern discovery.
Based on docs/architecture/pattern-detection-system.md Section 7.2

Key Features:
- Automatic cluster detection (no need to specify K)
- Temporal topic tracking
- Interpretable topic labels via c-TF-IDF
- Trend identification
"""

import logging
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass

import numpy as np
from scipy import stats
from bertopic import BERTopic
from hdbscan import HDBSCAN
from umap import UMAP
from sklearn.feature_extraction.text import CountVectorizer

logger = logging.getLogger(__name__)


@dataclass
class TopicResult:
    """Result from topic fitting."""
    topic_id: int
    name: str
    count: int
    words: List[str]
    scores: List[float]
    representative_docs: List[str]


@dataclass
class TopicTrend:
    """Trend information for a topic."""
    topic_id: int
    name: str
    growth_rate: float
    confidence: float
    frequency_by_period: List[Dict[str, Any]]


@dataclass
class TemporalTopic:
    """Topic at a specific time period."""
    topic_id: int
    name: str
    frequency: int
    timestamp: str


class TopicClusteringModel:
    """
    BERTopic-based topic clustering for complaint analysis.

    Configuration based on architecture document:
    - HDBSCAN: min_cluster_size=15, min_samples=5
    - UMAP: n_neighbors=15, n_components=5
    - Vectorizer: ngram_range=(1,3), min_df=5
    """

    def __init__(
        self,
        min_cluster_size: int = 15,
        min_samples: int = 5,
        n_neighbors: int = 15,
        n_components: int = 5,
        random_state: int = 42,
    ):
        """
        Initialize the topic clustering model.

        Args:
            min_cluster_size: Minimum complaints per pattern
            min_samples: Density requirement for HDBSCAN
            n_neighbors: UMAP neighborhood size
            n_components: UMAP output dimensions
            random_state: Random seed for reproducibility
        """
        self.min_cluster_size = min_cluster_size
        self.min_samples = min_samples
        self.n_neighbors = n_neighbors
        self.n_components = n_components
        self.random_state = random_state

        # Initialize sub-models
        self._hdbscan_model = None
        self._umap_model = None
        self._vectorizer_model = None
        self._topic_model = None
        self._is_fitted = False

    def _create_hdbscan(self) -> HDBSCAN:
        """Create HDBSCAN model with architecture-specified config."""
        return HDBSCAN(
            min_cluster_size=self.min_cluster_size,
            min_samples=self.min_samples,
            metric='euclidean',
            cluster_selection_method='eom',  # Excess of Mass (more clusters)
            prediction_data=True,  # Enable soft clustering
        )

    def _create_umap(self) -> UMAP:
        """Create UMAP model with architecture-specified config."""
        return UMAP(
            n_neighbors=self.n_neighbors,
            n_components=self.n_components,
            min_dist=0.0,
            metric='cosine',
            random_state=self.random_state,
        )

    def _create_vectorizer(self, n_docs: int = 1000) -> CountVectorizer:
        """
        Create CountVectorizer for topic representation.

        Dynamically adjusts min_df based on corpus size to handle
        smaller per-vehicle datasets from Option A filtering.
        """
        # Adaptive min_df: use smaller value for smaller corpora
        # For large corpora (1000+): min_df=5
        # For medium corpora (100-999): min_df=3
        # For small corpora (<100): min_df=2
        if n_docs >= 1000:
            min_df = 5
        elif n_docs >= 100:
            min_df = 3
        else:
            min_df = 2

        # max_df should be at least min_df + 1 documents worth
        # For corpus of 643 docs, 0.95 = 610 docs which is > min_df=3, so OK
        # But sklearn requires max_df as a proportion to result in > min_df docs
        # Use 1.0 (no upper limit) for smaller corpora to avoid the edge case
        max_df = 1.0 if n_docs < 1000 else 0.95

        return CountVectorizer(
            stop_words='english',
            ngram_range=(1, 2),  # Reduced to bigrams for smaller corpora
            min_df=min_df,
            max_df=max_df,
        )

    def _create_topic_model(self, n_docs: int = 1000) -> BERTopic:
        """Create BERTopic model with all components."""
        self._hdbscan_model = self._create_hdbscan()
        self._umap_model = self._create_umap()
        self._vectorizer_model = self._create_vectorizer(n_docs)

        return BERTopic(
            hdbscan_model=self._hdbscan_model,
            umap_model=self._umap_model,
            vectorizer_model=self._vectorizer_model,
            top_n_words=10,
            verbose=True,
            calculate_probabilities=True,
        )

    def fit(
        self,
        documents: List[str],
        embeddings: Optional[np.ndarray] = None,
    ) -> List[TopicResult]:
        """
        Fit the topic model on documents.

        Args:
            documents: List of complaint texts
            embeddings: Pre-computed embeddings (768-dim)

        Returns:
            List of TopicResult objects
        """
        n_docs = len(documents)
        logger.info(f"Fitting topic model on {n_docs} documents...")

        # Create fresh model with adaptive parameters for corpus size
        self._topic_model = self._create_topic_model(n_docs)

        # Log vectorizer parameters for debugging
        vec = self._vectorizer_model
        logger.info(f"Vectorizer params: min_df={vec.min_df}, max_df={vec.max_df}, ngram_range={vec.ngram_range}")

        # Fit the model
        try:
            if embeddings is not None:
                topics, probs = self._topic_model.fit_transform(documents, embeddings)
            else:
                topics, probs = self._topic_model.fit_transform(documents)
        except ValueError as e:
            logger.error(f"BERTopic fit_transform error: {e}")
            # Try with more permissive vectorizer settings
            logger.info("Retrying with more permissive vectorizer settings...")
            self._vectorizer_model = CountVectorizer(
                stop_words='english',
                ngram_range=(1, 1),  # Just unigrams
                min_df=1,  # Accept any term
                max_df=1.0,  # No upper limit
            )
            self._topic_model = BERTopic(
                hdbscan_model=self._hdbscan_model,
                umap_model=self._umap_model,
                vectorizer_model=self._vectorizer_model,
                top_n_words=10,
                verbose=True,
                calculate_probabilities=True,
            )
            if embeddings is not None:
                topics, probs = self._topic_model.fit_transform(documents, embeddings)
            else:
                topics, probs = self._topic_model.fit_transform(documents)

        self._is_fitted = True

        # Extract topic information
        topic_info = self._topic_model.get_topic_info()
        results = []

        for _, row in topic_info.iterrows():
            topic_id = row['Topic']
            if topic_id == -1:  # Skip outlier topic
                continue

            topic_words = self._topic_model.get_topic(topic_id)
            words = [word for word, score in topic_words]
            scores = [score for word, score in topic_words]

            # Get representative documents
            rep_docs = []
            if hasattr(self._topic_model, 'get_representative_docs'):
                try:
                    rep_docs = self._topic_model.get_representative_docs(topic_id)[:3]
                except Exception:
                    pass

            results.append(TopicResult(
                topic_id=topic_id,
                name=row.get('Name', f'Topic_{topic_id}'),
                count=row['Count'],
                words=words[:10],
                scores=scores[:10],
                representative_docs=rep_docs,
            ))

        logger.info(f"Found {len(results)} topics")
        return results

    def topics_over_time(
        self,
        documents: List[str],
        timestamps: List[str],
        nr_bins: int = 24,
        embeddings: Optional[np.ndarray] = None,
    ) -> List[TemporalTopic]:
        """
        Track topics over time.

        Args:
            documents: List of complaint texts
            timestamps: List of ISO date strings
            nr_bins: Number of time bins (e.g., 24 for monthly over 2 years)
            embeddings: Pre-computed embeddings

        Returns:
            List of TemporalTopic objects
        """
        if not self._is_fitted:
            self.fit(documents, embeddings)

        logger.info(f"Analyzing topics over time with {nr_bins} bins...")

        # Convert timestamps to datetime if needed
        import pandas as pd
        timestamps_dt = pd.to_datetime(timestamps)

        topics_over_time = self._topic_model.topics_over_time(
            docs=documents,
            timestamps=timestamps_dt,
            nr_bins=nr_bins,
            evolution_tuning=True,
            global_tuning=True,
        )

        results = []
        for _, row in topics_over_time.iterrows():
            results.append(TemporalTopic(
                topic_id=row['Topic'],
                name=row.get('Name', f"Topic_{row['Topic']}"),
                frequency=row['Frequency'],
                timestamp=str(row['Timestamp']),
            ))

        return results

    def identify_trends(
        self,
        topics_over_time: List[TemporalTopic],
        threshold: float = 0.5,
    ) -> List[TopicTrend]:
        """
        Identify topics with significant growth trends.

        Uses linear regression to detect growing topics.

        Args:
            topics_over_time: Output from topics_over_time()
            threshold: Minimum slope for trend detection

        Returns:
            List of TopicTrend objects sorted by growth rate
        """
        import pandas as pd

        # Convert to DataFrame for analysis
        df = pd.DataFrame([
            {'topic_id': t.topic_id, 'name': t.name,
             'frequency': t.frequency, 'timestamp': t.timestamp}
            for t in topics_over_time
        ])

        trends = []
        for topic_id in df['topic_id'].unique():
            if topic_id == -1:  # Skip outliers
                continue

            topic_data = df[df['topic_id'] == topic_id].sort_values('timestamp')
            if len(topic_data) < 3:  # Need at least 3 points
                continue

            # Calculate trend using linear regression
            x = np.arange(len(topic_data))
            y = topic_data['frequency'].values.astype(float)

            slope, intercept, r_value, p_value, std_err = stats.linregress(x, y)
            r_squared = r_value ** 2

            if slope > threshold and r_squared > 0.5:
                trends.append(TopicTrend(
                    topic_id=topic_id,
                    name=topic_data['name'].iloc[0],
                    growth_rate=float(slope),
                    confidence=float(r_squared),
                    frequency_by_period=[
                        {'timestamp': row['timestamp'], 'frequency': row['frequency']}
                        for _, row in topic_data.iterrows()
                    ],
                ))

        # Sort by growth rate descending
        trends.sort(key=lambda x: x.growth_rate, reverse=True)
        return trends

    def get_document_topics(
        self,
        document: str,
        embedding: Optional[np.ndarray] = None,
    ) -> Tuple[int, float]:
        """
        Get topic assignment for a single document.

        Args:
            document: Complaint text
            embedding: Pre-computed embedding

        Returns:
            Tuple of (topic_id, probability)
        """
        if not self._is_fitted:
            raise ValueError("Model must be fitted before prediction")

        if embedding is not None:
            topics, probs = self._topic_model.transform([document], [embedding])
        else:
            topics, probs = self._topic_model.transform([document])

        return topics[0], probs[0].max() if len(probs) > 0 else 0.0

    def get_topic_info(self) -> Dict[int, Dict[str, Any]]:
        """Get information about all topics."""
        if not self._is_fitted:
            return {}

        topic_info = self._topic_model.get_topic_info()
        result = {}

        for _, row in topic_info.iterrows():
            topic_id = row['Topic']
            if topic_id == -1:
                continue

            topic_words = self._topic_model.get_topic(topic_id)
            result[topic_id] = {
                'name': row.get('Name', f'Topic_{topic_id}'),
                'count': row['Count'],
                'words': [w for w, s in topic_words[:10]],
                'scores': [s for w, s in topic_words[:10]],
            }

        return result

    @property
    def is_fitted(self) -> bool:
        """Check if model is fitted."""
        return self._is_fitted


# Singleton instance for the service
_topic_model_instance: Optional[TopicClusteringModel] = None


def get_topic_model() -> TopicClusteringModel:
    """Get or create the singleton topic model instance."""
    global _topic_model_instance
    if _topic_model_instance is None:
        _topic_model_instance = TopicClusteringModel()
    return _topic_model_instance
