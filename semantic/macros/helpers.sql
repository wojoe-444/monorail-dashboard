{# "MUSEUM OF SCIENCE & INDUSTRY" -> "Museum Of Science & Industry" #}
{% macro title_case(col) -%}
    array_to_string(list_transform(string_split(lower({{ col }}), ' '), lambda w: upper(w[1]) || w[2:]), ' ')
{%- endmacro %}

{# Bearing in degrees (0 = east, 90 = north, counter-clockwise) from State & Madison. #}
{% macro bearing_from_origin(lat, lon) -%}
    ((degrees(atan2({{ lat }} - 41.88194, ({{ lon }} + 87.62778) * cos(radians(41.88194)))) + 360) % 360)
{%- endmacro %}

{#
  Approximate service sector from the bearing to State & Madison (the city grid's origin).
  Stations inside the elevated Loop rectangle are "Loop". A navigation aid, not an official district.
#}
{% macro service_sector(lat, lon) -%}
    case
        when {{ lat }} is null then 'Unknown'
        when {{ lat }} between 41.8755 and 41.8866 and {{ lon }} between -87.6390 and -87.6240 then 'Loop'
        when {{ bearing_from_origin(lat, lon) }} <= 112 then 'North'
        when {{ bearing_from_origin(lat, lon) }} <= 160 then 'Northwest'
        when {{ bearing_from_origin(lat, lon) }} <= 200 then 'West'
        when {{ bearing_from_origin(lat, lon) }} <= 250 then 'Southwest'
        else 'South'
    end
{%- endmacro %}

{# Day-type code from the CTA feeds to a label. #}
{% macro day_type_label(code) -%}
    case {{ code }} when 'W' then 'Weekday' when 'A' then 'Saturday' when 'U' then 'Sunday/Holiday' else 'Unknown' end
{%- endmacro %}

{#
  Write the marts the dashboard needs to CSV, for scripts/build-data.mjs to pack into the
  browser snapshot. Run with: dbt run-operation export_snapshot
#}
{% macro export_snapshot(dir='target/export') %}
    {% set tables = [
        'dim_stations', 'dim_lines', 'bridge_station_lines', 'dim_bus_routes', 'dim_service_days',
        'fct_rail_station_entries', 'fct_bus_route_rides', 'dq_source_checks'
    ] %}
    {% for t in tables %}
        {% do run_query("copy (select * from " ~ ref(t) ~ ") to '" ~ dir ~ "/" ~ t ~ ".csv' (header, delimiter ',')") %}
        {{ log('exported ' ~ t, info=true) }}
    {% endfor %}
{% endmacro %}
