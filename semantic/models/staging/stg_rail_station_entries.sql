-- One row per 'L' station per service day. Source: CTA 'L' Station Entries - Daily Totals (5neh-572f).
-- An "entry" is a fare-control turnstile entry: in-system transfers between lines are not counted.
with source as (
    select
        cast(station_id as integer) as station_id,
        stationname as source_station_name,
        cast(cast(date as timestamp) as date) as ride_date,
        daytype as day_type_code,
        cast(rides as integer) as rides
    from read_csv('{{ var("raw_path") }}/rail_station_entries.csv', header = true, all_varchar = true)
)

-- The portal has, at times, published a station-day twice. Keep one row per station-day
-- (the larger count) so sums never double, and keep the row count for the data-quality report.
select
    station_id,
    ride_date,
    max(source_station_name) as source_station_name,
    max(day_type_code) as day_type_code,
    max(rides) as rides,
    count(*) as source_rows
from source
group by station_id, ride_date
