-- One row per bus route per service day. Source: CTA Bus Routes - Daily Totals by Route (jyb9-n7fm).
-- Bus "rides" are boardings: a trip with a transfer counts once per bus boarded.
with source as (
    select
        trim(route) as route_id,
        cast(cast(date as timestamp) as date) as ride_date,
        daytype as day_type_code,
        cast(rides as integer) as rides
    from read_csv('{{ var("raw_path") }}/bus_route_rides.csv', header = true, all_varchar = true)
)

select
    route_id,
    ride_date,
    max(day_type_code) as day_type_code,
    max(rides) as rides,
    count(*) as source_rows
from source
group by route_id, ride_date
