-- Fact: 'L' station entries, one row per station per service day.
select station_id, ride_date, rides
from {{ ref('stg_rail_station_entries') }}
