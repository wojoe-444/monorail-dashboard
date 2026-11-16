-- Fact: 'L' station entries by line, one row per station per line per service day.
-- Entries are counted at the turnstile, so a station shared by n lines cannot say which line a rider took.
--   rides_allocated: entries split across the station's all-day lines (bridge allocation_weight). Sums to the system total.
--   station_rides:   the station's full count, repeated for every line. Shows a line's reach; never sum it across lines.
-- The dashboard derives this table in the browser from fct_rail_station_entries and bridge_station_lines
-- (src/features/semantic/data.ts) with the same logic, and the parity check compares the two.
select
    f.station_id,
    b.line_id,
    f.ride_date,
    f.rides as station_rides,
    f.rides * b.allocation_weight as rides_allocated
from {{ ref('fct_rail_station_entries') }} as f
inner join {{ ref('bridge_station_lines') }} as b on b.station_id = f.station_id
