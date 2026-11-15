-- A station-day appears once in the fact (staging deduplicates the feed).
select station_id, ride_date, count(*) as n
from {{ ref('fct_rail_station_entries') }}
group by 1, 2
having count(*) > 1
