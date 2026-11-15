-- Daily time spine for MetricFlow (offset windows reach back before the data starts).
select cast(range as date) as date_day
from range(date '2015-01-01', date '2031-01-01', interval 1 day)
