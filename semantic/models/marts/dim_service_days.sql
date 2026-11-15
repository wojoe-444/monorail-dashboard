-- One row per calendar day in the ridership window. Day type comes from the CTA feeds:
-- a weekday the CTA ran a Sunday schedule (a holiday) has day type "Sunday/Holiday".
with spine as (
    select date_day
    from {{ ref('metricflow_time_spine') }}
    where date_day between (select min(ride_date) from {{ ref('stg_rail_station_entries') }})
                       and (select max(ride_date) from {{ ref('stg_rail_station_entries') }})
),

codes as (
    select ride_date, mode(day_type_code) as day_type_code
    from (
        select ride_date, day_type_code from {{ ref('stg_rail_station_entries') }}
        union all
        select ride_date, day_type_code from {{ ref('stg_bus_route_rides') }}
    )
    group by ride_date
)

select
    s.date_day as ride_date,
    {{ day_type_label('c.day_type_code') }} as day_type,
    coalesce(c.day_type_code = 'U' and dayofweek(s.date_day) <> 0, false) as is_holiday,
    dayname(s.date_day) as day_of_week,
    isodow(s.date_day) as iso_day_of_week,
    isodow(s.date_day) >= 6 as is_weekend
from spine as s
left join codes as c on c.ride_date = s.date_day
