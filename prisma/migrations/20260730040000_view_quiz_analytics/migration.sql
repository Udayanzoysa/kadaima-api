-- Aggregated quiz performance for dashboard / analytics endpoints.
-- Columns match SELECT usage in analytics.service.ts and dashboard.service.ts.
CREATE OR REPLACE VIEW view_quiz_analytics AS
SELECT
  q.id AS quiz_id,
  COALESCE(
    NULLIF(q.title->>'en', ''),
    NULLIF(q.title->>'si', ''),
    NULLIF(q.title->>'ta', ''),
    'Untitled'
  ) AS quiz_title_en,
  COUNT(a.id)::bigint AS total_attempts,
  ROUND(AVG(a.final_score)::numeric, 2) AS average_class_score,
  MAX(a.final_score) AS highest_score,
  MIN(a.final_score) AS lowest_score,
  ROUND(
    (
      COUNT(*) FILTER (WHERE a.is_passed = true) * 100.0
      / NULLIF(COUNT(a.id), 0)
    )::numeric,
    2
  ) AS passing_rate_percentage
FROM quizzes q
LEFT JOIN quiz_attempts a
  ON a.quiz_id = q.id
 AND a.status IN ('Submitted', 'Timed_Out')
GROUP BY q.id, q.title;
