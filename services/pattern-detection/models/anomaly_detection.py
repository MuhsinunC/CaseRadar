"""
Anomaly Detection Module

PyOD ensemble implementation for detecting unusual complaints.
Based on docs/architecture/pattern-detection-system.md Section 7.3

Key Features:
- Ensemble of complementary detectors (IF + LOF + HBOS)
- Normalized scores (0-1 range)
- Configurable contamination rate
"""

import logging
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass

import numpy as np
from pyod.models.iforest import IForest
from pyod.models.lof import LOF
from pyod.models.hbos import HBOS

logger = logging.getLogger(__name__)


@dataclass
class AnomalyResult:
    """Result for a single document's anomaly analysis."""
    document_id: str
    anomaly_score: float  # 0-1, higher = more anomalous
    is_anomaly: bool
    detector_scores: Dict[str, float]
    anomaly_type: str  # 'point', 'contextual', 'collective'


@dataclass
class AnomalyStats:
    """Statistics about anomaly detection run."""
    total_documents: int
    anomaly_count: int
    anomaly_rate: float
    score_mean: float
    score_std: float
    threshold: float


class AnomalyDetectionModel:
    """
    PyOD ensemble for anomaly detection in complaint embeddings.

    Configuration based on architecture document:
    - Isolation Forest: n_estimators=100, contamination=0.05
    - LOF: n_neighbors=20, contamination=0.05, novelty=True
    - HBOS: n_bins=50, contamination=0.05
    """

    def __init__(
        self,
        contamination: float = 0.05,
        n_estimators: int = 100,
        n_neighbors: int = 20,
        n_bins: int = 50,
        random_state: int = 42,
    ):
        """
        Initialize the anomaly detection model.

        Args:
            contamination: Expected proportion of anomalies (0.05 = 5%)
            n_estimators: Number of trees for Isolation Forest
            n_neighbors: Neighbors for LOF
            n_bins: Bins for HBOS
            random_state: Random seed for reproducibility
        """
        self.contamination = contamination
        self.n_estimators = n_estimators
        self.n_neighbors = n_neighbors
        self.n_bins = n_bins
        self.random_state = random_state

        # Initialize detectors
        self._detectors: Dict[str, Any] = {}
        self._is_fitted = False
        self._threshold = 0.5  # Default threshold

    def _create_detectors(self) -> Dict[str, Any]:
        """Create the ensemble of detectors."""
        return {
            'isolation_forest': IForest(
                n_estimators=self.n_estimators,
                contamination=self.contamination,
                random_state=self.random_state,
            ),
            'local_outlier_factor': LOF(
                n_neighbors=self.n_neighbors,
                contamination=self.contamination,
                novelty=True,  # Enable prediction on new data
            ),
            'histogram_based': HBOS(
                n_bins=self.n_bins,
                contamination=self.contamination,
            ),
        }

    def fit(self, embeddings: np.ndarray) -> AnomalyStats:
        """
        Fit the anomaly detection ensemble.

        Args:
            embeddings: Document embeddings (n_samples, n_features)

        Returns:
            AnomalyStats with fitting statistics
        """
        logger.info(f"Fitting anomaly detection on {len(embeddings)} documents...")

        # Create fresh detectors
        self._detectors = self._create_detectors()

        # Fit each detector
        for name, detector in self._detectors.items():
            logger.info(f"Fitting {name}...")
            detector.fit(embeddings)

        self._is_fitted = True

        # Calculate initial scores and stats
        scores = self._get_ensemble_scores(embeddings)
        self._threshold = np.percentile(scores, (1 - self.contamination) * 100)

        anomaly_mask = scores >= self._threshold

        return AnomalyStats(
            total_documents=len(embeddings),
            anomaly_count=int(anomaly_mask.sum()),
            anomaly_rate=float(anomaly_mask.mean()),
            score_mean=float(scores.mean()),
            score_std=float(scores.std()),
            threshold=float(self._threshold),
        )

    def _get_ensemble_scores(self, embeddings: np.ndarray) -> np.ndarray:
        """
        Get ensemble anomaly scores.

        Combines scores from all detectors using averaging.

        Args:
            embeddings: Document embeddings

        Returns:
            Normalized ensemble scores (0-1)
        """
        all_scores = []

        for name, detector in self._detectors.items():
            # Get raw decision scores
            raw_scores = detector.decision_function(embeddings)

            # Normalize to 0-1 range
            min_score = raw_scores.min()
            max_score = raw_scores.max()
            if max_score > min_score:
                normalized = (raw_scores - min_score) / (max_score - min_score)
            else:
                normalized = np.zeros_like(raw_scores)

            all_scores.append(normalized)

        # Average across detectors
        ensemble_scores = np.mean(all_scores, axis=0)
        return ensemble_scores

    def _get_individual_scores(self, embeddings: np.ndarray) -> Dict[str, np.ndarray]:
        """Get normalized scores from each detector."""
        scores = {}

        for name, detector in self._detectors.items():
            raw_scores = detector.decision_function(embeddings)

            # Normalize to 0-1
            min_score = raw_scores.min()
            max_score = raw_scores.max()
            if max_score > min_score:
                scores[name] = (raw_scores - min_score) / (max_score - min_score)
            else:
                scores[name] = np.zeros_like(raw_scores)

        return scores

    def detect(
        self,
        embeddings: np.ndarray,
        document_ids: Optional[List[str]] = None,
        threshold: Optional[float] = None,
    ) -> List[AnomalyResult]:
        """
        Detect anomalies in documents.

        Args:
            embeddings: Document embeddings
            document_ids: Optional IDs for each document
            threshold: Custom threshold (default: use fitted threshold)

        Returns:
            List of AnomalyResult objects
        """
        if not self._is_fitted:
            raise ValueError("Model must be fitted before detection")

        # Use provided threshold or fitted threshold
        thresh = threshold if threshold is not None else self._threshold

        # Get scores
        ensemble_scores = self._get_ensemble_scores(embeddings)
        individual_scores = self._get_individual_scores(embeddings)

        # Generate document IDs if not provided
        if document_ids is None:
            document_ids = [f"doc_{i}" for i in range(len(embeddings))]

        results = []
        for i, (doc_id, score) in enumerate(zip(document_ids, ensemble_scores)):
            is_anomaly = score >= thresh

            # Determine anomaly type based on which detectors flagged it
            anomaly_type = self._classify_anomaly_type(
                individual_scores['isolation_forest'][i],
                individual_scores['local_outlier_factor'][i],
                thresh,
            )

            results.append(AnomalyResult(
                document_id=doc_id,
                anomaly_score=float(score),
                is_anomaly=bool(is_anomaly),
                detector_scores={
                    name: float(scores[i])
                    for name, scores in individual_scores.items()
                },
                anomaly_type=anomaly_type if is_anomaly else 'normal',
            ))

        return results

    def _classify_anomaly_type(
        self,
        if_score: float,
        lof_score: float,
        threshold: float,
    ) -> str:
        """
        Classify the type of anomaly.

        Types based on architecture document:
        - Point: Isolated unusual complaint (IF high)
        - Contextual: Normal overall but unusual in context (LOF high)
        - Collective: Part of unusual group (both high)
        """
        if_high = if_score >= threshold
        lof_high = lof_score >= threshold

        if if_high and lof_high:
            return 'collective'
        elif lof_high:
            return 'contextual'
        elif if_high:
            return 'point'
        else:
            return 'normal'

    def score_single(self, embedding: np.ndarray) -> Tuple[float, Dict[str, float]]:
        """
        Score a single document.

        Args:
            embedding: Single document embedding (1D or 2D with shape (1, n))

        Returns:
            Tuple of (ensemble_score, individual_scores)
        """
        if not self._is_fitted:
            raise ValueError("Model must be fitted before scoring")

        # Ensure 2D
        if embedding.ndim == 1:
            embedding = embedding.reshape(1, -1)

        ensemble_scores = self._get_ensemble_scores(embedding)
        individual_scores = self._get_individual_scores(embedding)

        return (
            float(ensemble_scores[0]),
            {name: float(scores[0]) for name, scores in individual_scores.items()},
        )

    @property
    def is_fitted(self) -> bool:
        """Check if model is fitted."""
        return self._is_fitted

    @property
    def threshold(self) -> float:
        """Get the current anomaly threshold."""
        return self._threshold


# Singleton instance
_anomaly_model_instance: Optional[AnomalyDetectionModel] = None


def get_anomaly_model() -> AnomalyDetectionModel:
    """Get or create the singleton anomaly model instance."""
    global _anomaly_model_instance
    if _anomaly_model_instance is None:
        _anomaly_model_instance = AnomalyDetectionModel()
    return _anomaly_model_instance
