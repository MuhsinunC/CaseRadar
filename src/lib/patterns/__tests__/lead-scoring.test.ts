/**
 * Lead Scoring Tests
 * TDD: These tests are written FIRST (Red phase)
 * They should FAIL until implementation is complete
 */

import { describe, it, expect } from 'vitest';
import { calculateLeadScore, rankLeads, LeadScoreInput, LeadScoreResult } from '../lead-scoring';

describe('Lead Scoring', () => {
  describe('calculateLeadScore', () => {
    it('should return higher score for more complaints', () => {
      const lowComplaints: LeadScoreInput = {
        complaintCount: 10,
        severityScore: 50,
        avgSemanticMatch: 0.5,
        trendScore: 0,
      };

      const highComplaints: LeadScoreInput = {
        complaintCount: 100,
        severityScore: 50,
        avgSemanticMatch: 0.5,
        trendScore: 0,
      };

      const lowScore = calculateLeadScore(lowComplaints);
      const highScore = calculateLeadScore(highComplaints);

      expect(highScore.score).toBeGreaterThan(lowScore.score);
    });

    it('should return higher score for higher severity', () => {
      const lowSeverity: LeadScoreInput = {
        complaintCount: 50,
        severityScore: 20,
        avgSemanticMatch: 0.5,
        trendScore: 0,
      };

      const highSeverity: LeadScoreInput = {
        complaintCount: 50,
        severityScore: 80,
        avgSemanticMatch: 0.5,
        trendScore: 0,
      };

      const lowScore = calculateLeadScore(lowSeverity);
      const highScore = calculateLeadScore(highSeverity);

      expect(highScore.score).toBeGreaterThan(lowScore.score);
    });

    it('should return higher score for lower semantic match', () => {
      const highMatch: LeadScoreInput = {
        complaintCount: 50,
        severityScore: 50,
        avgSemanticMatch: 0.9, // High match = recall addresses issue
        trendScore: 0,
      };

      const lowMatch: LeadScoreInput = {
        complaintCount: 50,
        severityScore: 50,
        avgSemanticMatch: 0.2, // Low match = recall doesn't address issue
        trendScore: 0,
      };

      const highMatchScore = calculateLeadScore(highMatch);
      const lowMatchScore = calculateLeadScore(lowMatch);

      // Lower semantic match = higher lead score (pattern not addressed by recalls)
      expect(lowMatchScore.score).toBeGreaterThan(highMatchScore.score);
    });

    it('should normalize score to 0-100 range', () => {
      const input: LeadScoreInput = {
        complaintCount: 500,
        severityScore: 100,
        avgSemanticMatch: 0,
        trendScore: 100,
      };

      const result = calculateLeadScore(input);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('should include score breakdown in result', () => {
      const input: LeadScoreInput = {
        complaintCount: 50,
        severityScore: 60,
        avgSemanticMatch: 0.3,
        trendScore: 10,
      };

      const result = calculateLeadScore(input);

      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('breakdown');
      expect(result.breakdown).toHaveProperty('complaintFactor');
      expect(result.breakdown).toHaveProperty('severityFactor');
      expect(result.breakdown).toHaveProperty('semanticFactor');
      expect(result.breakdown).toHaveProperty('trendFactor');
    });

    it('should handle edge case of zero complaints', () => {
      const input: LeadScoreInput = {
        complaintCount: 0,
        severityScore: 50,
        avgSemanticMatch: 0.5,
        trendScore: 0,
      };

      const result = calculateLeadScore(input);

      expect(result.score).toBe(0);
    });

    it('should handle patterns with no recalls (avgSemanticMatch = -1)', () => {
      const noRecalls: LeadScoreInput = {
        complaintCount: 100,
        severityScore: 70,
        avgSemanticMatch: -1, // Sentinel value for no recalls
        trendScore: 50,
      };

      const result = calculateLeadScore(noRecalls);

      // No recalls = maximum semantic factor (very high lead value)
      expect(result.breakdown.semanticFactor).toBeGreaterThanOrEqual(0.9);
    });
  });

  describe('rankLeads', () => {
    const mockPatterns = [
      {
        id: 'pattern-1',
        name: 'Low Value Lead',
        complaintCount: 10,
        severityScore: 20,
        avgSemanticMatch: 0.9,
        trendScore: 0,
      },
      {
        id: 'pattern-2',
        name: 'High Value Lead',
        complaintCount: 500,
        severityScore: 85,
        avgSemanticMatch: 0.1,
        trendScore: 80,
      },
      {
        id: 'pattern-3',
        name: 'Medium Value Lead',
        complaintCount: 100,
        severityScore: 50,
        avgSemanticMatch: 0.5,
        trendScore: 30,
      },
    ];

    it('should sort patterns by lead score descending', () => {
      const ranked = rankLeads(mockPatterns);

      expect(ranked[0].pattern.id).toBe('pattern-2'); // Highest score
      expect(ranked[ranked.length - 1].pattern.id).toBe('pattern-1'); // Lowest score

      // Verify descending order
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i - 1].leadScore).toBeGreaterThanOrEqual(ranked[i].leadScore);
      }
    });

    it('should filter out patterns below minimum score', () => {
      const ranked = rankLeads(mockPatterns, { minScore: 30 });

      ranked.forEach((lead) => {
        expect(lead.leadScore).toBeGreaterThanOrEqual(30);
      });
    });

    it('should filter out patterns with high semantic match', () => {
      const ranked = rankLeads(mockPatterns, { maxSemanticMatch: 0.5 });

      ranked.forEach((lead) => {
        expect(lead.pattern.avgSemanticMatch).toBeLessThanOrEqual(0.5);
      });
    });

    it('should limit results with top parameter', () => {
      const allLeads = rankLeads(mockPatterns);
      const topLeads = rankLeads(mockPatterns, { top: 2 });

      expect(topLeads.length).toBe(2);
      expect(topLeads[0]).toEqual(allLeads[0]);
      expect(topLeads[1]).toEqual(allLeads[1]);
    });

    it('should include lead score and breakdown in results', () => {
      const ranked = rankLeads(mockPatterns);

      ranked.forEach((lead) => {
        expect(lead).toHaveProperty('leadScore');
        expect(lead).toHaveProperty('breakdown');
        expect(lead).toHaveProperty('pattern');
      });
    });

    it('should handle empty input array', () => {
      const ranked = rankLeads([]);

      expect(ranked).toEqual([]);
    });

    it('should filter by minimum complaint count', () => {
      const ranked = rankLeads(mockPatterns, { minComplaintCount: 50 });

      ranked.forEach((lead) => {
        expect(lead.pattern.complaintCount).toBeGreaterThanOrEqual(50);
      });
    });
  });
});
