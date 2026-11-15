-- Route names. Source: CTA Bus Routes (6uva-a5ei).
select
    trim(route) as route_id,
    max(name) as route_name_upper
from read_csv('{{ var("raw_path") }}/bus_routes.csv', header = true, all_varchar = true)
group by 1
