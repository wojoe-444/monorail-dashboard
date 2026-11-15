-- One row per station per line that serves it. A station on n lines appears n times.
with stations as (
    select station_id, line_count, unnest(string_split(lines, ', ')) as line_name
    from {{ ref('dim_stations') }}
    where line_count > 0
)

select
    s.station_id,
    l.line_id,
    s.line_count
from stations as s
inner join {{ ref('lines') }} as l on l.line_name = s.line_name
