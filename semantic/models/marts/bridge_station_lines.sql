-- One row per station per line that serves it. A station on n lines appears n times.
--
-- allocation_weight is the line's share of the station's entries in the "allocated" line metrics.
-- Shares are even across the lines that run there all day. The Purple Line Express is the exception:
-- south of Howard it stops at Loop and North Side Main Line stations on weekdays at rush hour only, so
-- an even split would credit it with a fifth of Clark/Lake. It keeps its full share from Howard north
-- (Howard and Evanston, its all-day service) and gets none at its express-only stops. It still counts as
-- serving those stations (the lines list, line pages, "entries at line stations").
with stations as (
    select station_id, latitude, unnest(string_split(lines, ', ')) as line_name
    from {{ ref('dim_stations') }}
    where line_count > 0
),

flagged as (
    select
        s.station_id,
        l.line_id,
        not (l.line_id = 'purple' and coalesce(s.latitude, 0) < {{ var('howard_latitude') }}) as allocates
    from stations as s
    inner join {{ ref('lines') }} as l on l.line_name = s.line_name
)

select
    station_id,
    line_id,
    count(*) over (partition by station_id) as line_count,
    case
        when allocates then 1.0 / count(*) filter (where allocates) over (partition by station_id)
        else 0.0
    end as allocation_weight
from flagged
