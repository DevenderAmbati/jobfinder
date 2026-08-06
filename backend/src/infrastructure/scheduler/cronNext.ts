import { CronExpressionParser } from 'cron-parser';

/**
 * Next fire time after currentDate for a cron expression.
 */
export function parseCronNext(expression: string, currentDate: Date): Date {
  const interval = CronExpressionParser.parse(expression, {
    currentDate,
  });
  return interval.next().toDate();
}
