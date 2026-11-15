-- Data-quality findings from the source feeds, shown on the dashboard's Data page.
select 'rail' as mode, 'duplicate_station_days' as check_name,
       'Station-days published more than once (deduplicated, larger count kept)' as description,
       count(*) as affected_rows
from {{ ref('stg_rail_station_entries') }} where source_rows > 1
union all
select 'bus', 'duplicate_route_days',
       'Route-days published more than once (deduplicated, larger count kept)', count(*)
from {{ ref('stg_bus_route_rides') }} where source_rows > 1
union all
select 'rail', 'stations_missing_from_stops_list',
       'Stations in the ridership feed with no platform in the stops list (no lines, coordinates or ADA flag)', count(*)
from {{ ref('dim_stations') }} where not in_stops_list
union all
select 'rail', 'stops_list_stations_without_ridership',
       'Stations in the stops list with no ridership in the window', count(*)
from {{ ref('dim_stations') }} where first_ride_date is null
union all
select 'bus', 'routes_missing_names',
       'Routes in the ridership feed with no entry in the routes list', count(*)
from {{ ref('dim_bus_routes') }} where not in_routes_list
union all
select 'rail', 'zero_entry_station_days',
       'Station-days reported with zero entries (closures, or a counting outage)', count(*)
from {{ ref('stg_rail_station_entries') }} where rides = 0
union all
select 'bus', 'zero_ride_route_days',
       'Route-days reported with zero boardings', count(*)
from {{ ref('stg_bus_route_rides') }} where rides = 0
