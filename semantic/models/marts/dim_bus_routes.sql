-- One row per bus route seen in the ridership feed, named from the routes list.
with ridership as (
    select route_id, min(ride_date) as first_ride_date, max(ride_date) as last_ride_date
    from {{ ref('stg_bus_route_rides') }}
    group by route_id
)

select
    r.route_id,
    case when n.route_name_upper is null then 'Route ' || r.route_id else {{ title_case('n.route_name_upper') }} end as route_name,
    case
        when r.route_id like 'X%' then 'Express'
        when try_cast(r.route_id as integer) >= 1000 then 'Shuttle'
        else 'Local'
    end as route_type,
    n.route_name_upper is not null as in_routes_list,
    r.first_ride_date,
    r.last_ride_date
from ridership as r
left join {{ ref('stg_bus_routes') }} as n on n.route_id = r.route_id
