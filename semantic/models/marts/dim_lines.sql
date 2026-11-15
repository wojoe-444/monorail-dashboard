-- One row per 'L' route, with the number of stations it serves.
select
    l.line_id,
    l.line_name,
    l.color_hex,
    l.sort_order,
    count(b.station_id) as station_count
from {{ ref('lines') }} as l
left join {{ ref('bridge_station_lines') }} as b on b.line_id = l.line_id
group by all
order by l.sort_order
