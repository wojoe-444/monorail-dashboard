-- One row per platform (stop) per direction. Source: CTA List of 'L' Stops (8pix-ypme).
-- map_id is the parent station and matches station_id in the ridership data.
select
    cast(stop_id as integer) as stop_id,
    cast(map_id as integer) as station_id,
    direction_id,
    stop_name,
    station_name,
    station_descriptive_name,
    cast(ada as boolean) as ada,
    cast(red as boolean) as red,
    cast(blue as boolean) as blue,
    cast(brn as boolean) as brown,
    cast(g as boolean) as green,
    cast(o as boolean) as orange,
    cast(p as boolean) as purple,
    cast(pnk as boolean) as pink,
    cast(y as boolean) as yellow,
    cast(latitude as double) as latitude,
    cast(longitude as double) as longitude
from read_csv('{{ var("raw_path") }}/l_stops.csv', header = true, all_varchar = true)
