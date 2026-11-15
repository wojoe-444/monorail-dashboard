-- Fact: bus boardings, one row per route per service day.
select route_id, ride_date, rides
from {{ ref('stg_bus_route_rides') }}
