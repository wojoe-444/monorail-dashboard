-- Allocated line entries must add back up to station entries (no rider lost or double counted).
with by_day as (
    select ride_date, sum(rides_allocated) as allocated from {{ ref('fct_rail_line_entries') }} group by 1
),
station as (
    select f.ride_date, sum(f.rides) as rides
    from {{ ref('fct_rail_station_entries') }} f
    where f.station_id in (select station_id from {{ ref('bridge_station_lines') }})
    group by 1
)
select s.ride_date, s.rides, b.allocated
from station s join by_day b using (ride_date)
where abs(s.rides - b.allocated) > 0.5
