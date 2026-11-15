-- One row per 'L' station (parent station, the ridership grain).
-- Built from the ridership feed so stations that closed or were renamed still resolve,
-- enriched with lines, accessibility and coordinates from the stops list.
with platforms as (
    select
        station_id,
        min(station_descriptive_name) as descriptive_name,
        bool_and(ada) as ada_accessible,
        bool_or(red) as red,
        bool_or(blue) as blue,
        bool_or(brown) as brown,
        bool_or(green) as green,
        bool_or(orange) as orange,
        bool_or(purple) as purple,
        bool_or(pink) as pink,
        bool_or(yellow) as yellow,
        avg(latitude) as latitude,
        avg(longitude) as longitude,
        count(*) as platform_count
    from {{ ref('stg_l_stops') }}
    group by station_id
),

ridership as (
    select
        station_id,
        arg_max(source_station_name, ride_date) as station_name,
        min(ride_date) as first_ride_date,
        max(ride_date) as last_ride_date
    from {{ ref('stg_rail_station_entries') }}
    group by station_id
),

joined as (
    select
        coalesce(r.station_id, p.station_id) as station_id,
        coalesce(r.station_name, p.descriptive_name) as station_name,
        p.ada_accessible,
        p.latitude,
        p.longitude,
        coalesce(p.platform_count, 0) as platform_count,
        r.first_ride_date,
        r.last_ride_date,
        p.station_id is not null as in_stops_list,
        list_filter([
            case when p.red then 'Red' end,
            case when p.blue then 'Blue' end,
            case when p.brown then 'Brown' end,
            case when p.green then 'Green' end,
            case when p.orange then 'Orange' end,
            case when p.purple then 'Purple' end,
            case when p.pink then 'Pink' end,
            case when p.yellow then 'Yellow' end
        ], lambda x: x is not null) as line_list
    from ridership as r
    full outer join platforms as p on r.station_id = p.station_id
)

select
    station_id,
    station_name,
    coalesce(ada_accessible, false) as ada_accessible,
    latitude,
    longitude,
    {{ service_sector('latitude', 'longitude') }} as sector,
    case when len(line_list) = 0 then 'Unknown' else array_to_string(line_list, ', ') end as lines,
    len(line_list) as line_count,
    len(line_list) > 1 as is_transfer_station,
    platform_count,
    in_stops_list,
    first_ride_date,
    last_ride_date
from joined
