#us-county-osm-highway-lengths

A dataset containaing the total length of various OpenStreetMap road designations in every U.S. County.

#Data Sample

|           |            |              |                  |                  |                  |                  |             |                  |                  |                    |           |                  |                 |                  |                  |                  |            |                |                  |                  |          |                  |                  |                  |                |                  |                  |                  |        |            |             |           |                 |                  |                  |                  |         | 
|-----------|------------|--------------|------------------|------------------|------------------|------------------|-------------|------------------|------------------|--------------------|-----------|------------------|-----------------|------------------|------------------|------------------|------------|----------------|------------------|------------------|----------|------------------|------------------|------------------|----------------|------------------|------------------|------------------|--------|------------|-------------|-----------|-----------------|------------------|------------------|------------------|---------| 
| "statefp" | "countyfp" | "name"       | "unclassified"   | "footway"        | "motorway"       | "proposed"       | "abandoned" | "tertiary"       | "trunk"          | "residential_link" | "raceway" | "tertiary_link"  | "motorway_link" | "steps"          | "bridleway"      | "pedestrian"     | "conveyor" | "turning_loop" | "secondary_link" | "primary_link"   | "escape" | "service"        | "cycleway"       | "trunk_link"     | "bus_guideway" | "living_street"  | "path"           | "residential"    | "road" | "corridor" | "rest_area" | "disused" | "construction"  | "primary"        | "secondary"      | "track"          | "fips"  | 
| "24"      | "031"      | "Montgomery" | 67446.9493371149 | 92398.4727026832 | 167470.589723506 | 4491.22035487427 | 0           | 690595.108047204 | 74227.6070110654 | 0                  | 0         | 802.761244414873 | 0               | 26.6094934479572 | 4803.37286355511 | 2943.55348166935 | 0          | 0              | 567.93989380164  | 1358.33573901069 | 0        | 62550.4557757217 | 125849.222325588 | 71.3823231710851 | 0              | 540.063866187629 | 288256.293653535 | 4026524.74318361 | 0      | 0          | 0           | 0         | 11239.731749804 | 530667.257433003 | 477105.504754047 | 12015.2063249526 | "24031" | 

#Background

OpenStreetMap includes various types of roads, and these are designated using the `highway` key.  You can see all of the various highway types [on the OSM wiki](http://wiki.openstreetmap.org/wiki/Key:highway).

#Methodology

Load U.S. Census Tiger Data into PostGIS
Using a node.js script, interate over the 3233 counties.  For each:
  - Get a the bounding box of the county's geometry
  - Query OSM's [Overpass API](http://wiki.openstreetmap.org/wiki/Overpass_API) for all ways with `highway` tags in the given bounding box
  - 
  - Load the OSM data into a temporary table
  - Do a spatial query on the OSM data, using `ST_Intersects()` to determine which ways intersect with the county's geometry. 
  - Query these ways, using `ST_Intersection()` to clip them to the county boundary, and `ST_Length()` to get their length in meters (this requires casting them to `geography` type), then SUM them by type, and put each sum into its own column.

The result is a total length in meters for each highway tag for every U.S. County.

*Fun fact*: There are four U.S. Counties that do not include any roads.  Rose Island (Rhode Island), Swains Island (American Samoa), Northern Islands (Guam), and Aleutians West (Alaska)

##Data Sources

County boundaries are found in [U.S. Census TIGER line files (counties and equivalent)](https://www.census.gov/cgi-bin/geo/shapefiles/index.php?year=2016&layergroup=Counties+%28and+equivalent%29) which are downloaded as a zipped shapefile.

OSM data can be exported for a specific bounding box using the [Overpass API](http://wiki.openstreetmap.org/wiki/Overpass_API).  The response is OSM's XML format, which can be imported into PostGIS with the command line tool `osm2pgsql`

Querying for ways, including the highway tag information:

`http://overpass-api.de/api/interpreter?data=way["highway"](${bbox.s},${bbox.w},${bbox.n},${bbox.e});(._;>;);out;`

##Loading Data
 
Create a new database called `osm` in a local postgres DB, enable PostGIS on it using `CREATE EXTENSION postgis;`

To load county boundary data, use `shp2pgsql`, converting from 4269 to 4326:
```
shp2pgsql -s 4269:4326 tl_2016_us_county | psql -h localhost -U postgres -d osm
``` 

Create a spatial index on the boundary data:
```
CREATE INDEX tl_2016_us_county_index ON tl_2016_us_county USING GIST (geom);
```

Load the OSM data using `osm2pgsql`:
```
osm2pgsql -c -d osm -U postgres -W -H localhost -S osm2pgsql/default.style osmdata/maryland-latest.osm.pbf
```
The geometry column is called `way`, let's change it to `geom` so it looks like every other table, and also transform it to 4326.

```
ALTER TABLE planet_osm_line
 ALTER COLUMN way TYPE geometry(LineString,4326) 
  USING ST_Transform(way,4326);
```

```
ALTER TABLE planet_osm_line
 RENAME COLUMN way TO geom
```

Table `planet_osm_line` contains the data we are looking for (lines with a highway key).

##Spatial Query

This query will give us one row per county, with a sum of the length of each `highway` value in meters.  This query took 1 hour and 27 minutes to execute on Maryland's OSM line data.

Some ideas for making it faster:
- start with just lines `WHERE highway IS NOT NULL`, not sure how much effect this will have though.

SELECT poly.statefp, poly.countyfp, poly.name, 
sum(CASE WHEN highway = 'unclassified' THEN ST_Length(ST_Intersection(poly.geom, st_transform(line.way, 4326))::geography) ELSE 0 END) as unclassified,
sum(CASE WHEN highway = 'footway' THEN ST_Length(ST_Intersection(poly.geom, st_transform(line.way, 4326))::geography) ELSE 0 END) as footway,
sum(CASE WHEN highway = 'motorway' THEN ST_Length(ST_Intersection(poly.geom, st_transform(line.way, 4326))::geography) ELSE 0 END) as motorway,
sum(CASE WHEN highway = 'proposed' THEN ST_Length(ST_Intersection(poly.geom, st_transform(line.way, 4326))::geography) ELSE 0 END) as proposed,
sum(CASE WHEN highway = 'abandoned' THEN ST_Length(ST_Intersection(poly.geom, st_transform(line.way, 4326))::geography) ELSE 0 END) as abandoned,
sum(CASE WHEN highway = 'tertiary' THEN ST_Length(ST_Intersection(poly.geom, st_transform(line.way, 4326))::geography) ELSE 0 END) as tertiary,
sum(CASE WHEN highway = 'trunk' THEN ST_Length(ST_Intersection(poly.geom, st_transform(line.way, 4326))::geography) ELSE 0 END) as trunk,
sum(CASE WHEN highway = 'residential_link' THEN ST_Length(ST_Intersection(poly.geom, st_transform(line.way, 4326))::geography) ELSE 0 END) as residential_link,
sum(CASE WHEN highway = 'raceway' THEN ST_Length(ST_Intersection(poly.geom, st_transform(line.way, 4326))::geography) ELSE 0 END) as raceway,
sum(CASE WHEN highway = 'tertiary_link' THEN ST_Length(ST_Intersection(poly.geom, st_transform(line.way, 4326))::geography) ELSE 0 END) as tertiary_link,
sum(CASE WHEN highway = 'motorway_link' THEN ST_Length(ST_Intersection(poly.geom, st_transform(line.way, 4326))::geography) ELSE 0 END) as motorway_link,
sum(CASE WHEN highway = 'steps' THEN ST_Length(ST_Intersection(poly.geom, st_transform(line.way, 4326))::geography) ELSE 0 END) as steps,
sum(CASE WHEN highway = 'bridleway' THEN ST_Length(ST_Intersection(poly.geom, st_transform(line.way, 4326))::geography) ELSE 0 END) as bridleway,
sum(CASE WHEN highway = 'pedestrian' THEN ST_Length(ST_Intersection(poly.geom, st_transform(line.way, 4326))::geography) ELSE 0 END) as pedestrian,
sum(CASE WHEN highway = 'conveyor' THEN ST_Length(ST_Intersection(poly.geom, st_transform(line.way, 4326))::geography) ELSE 0 END) as conveyor,
sum(CASE WHEN highway = 'turning_loop' THEN ST_Length(ST_Intersection(poly.geom, st_transform(line.way, 4326))::geography) ELSE 0 END) as turning_loop,
sum(CASE WHEN highway = 'secondary_link' THEN ST_Length(ST_Intersection(poly.geom, st_transform(line.way, 4326))::geography) ELSE 0 END) as secondary_link,
sum(CASE WHEN highway = 'primary_link' THEN ST_Length(ST_Intersection(poly.geom, st_transform(line.way, 4326))::geography) ELSE 0 END) as primary_link,
sum(CASE WHEN highway = 'escape' THEN ST_Length(ST_Intersection(poly.geom, st_transform(line.way, 4326))::geography) ELSE 0 END) as escape,
sum(CASE WHEN highway = 'service' THEN ST_Length(ST_Intersection(poly.geom, st_transform(line.way, 4326))::geography) ELSE 0 END) as service,
sum(CASE WHEN highway = 'cycleway' THEN ST_Length(ST_Intersection(poly.geom, st_transform(line.way, 4326))::geography) ELSE 0 END) as cycleway,
sum(CASE WHEN highway = 'trunk_link' THEN ST_Length(ST_Intersection(poly.geom, st_transform(line.way, 4326))::geography) ELSE 0 END) as trunk_link,
sum(CASE WHEN highway = 'bus_guideway' THEN ST_Length(ST_Intersection(poly.geom, st_transform(line.way, 4326))::geography) ELSE 0 END) as bus_guideway,
sum(CASE WHEN highway = 'living_street' THEN ST_Length(ST_Intersection(poly.geom, st_transform(line.way, 4326))::geography) ELSE 0 END) as living_street,
sum(CASE WHEN highway = 'path' THEN ST_Length(ST_Intersection(poly.geom, st_transform(line.way, 4326))::geography) ELSE 0 END) as path,
sum(CASE WHEN highway = 'residential' THEN ST_Length(ST_Intersection(poly.geom, st_transform(line.way, 4326))::geography) ELSE 0 END) as residential,
sum(CASE WHEN highway = 'road' THEN ST_Length(ST_Intersection(poly.geom, st_transform(line.way, 4326))::geography) ELSE 0 END) as road,
sum(CASE WHEN highway = 'corridor' THEN ST_Length(ST_Intersection(poly.geom, st_transform(line.way, 4326))::geography) ELSE 0 END) as corridor,
sum(CASE WHEN highway = 'rest_area' THEN ST_Length(ST_Intersection(poly.geom, st_transform(line.way, 4326))::geography) ELSE 0 END) as rest_area,
sum(CASE WHEN highway = 'disused' THEN ST_Length(ST_Intersection(poly.geom, st_transform(line.way, 4326))::geography) ELSE 0 END) as disused,
sum(CASE WHEN highway = 'construction' THEN ST_Length(ST_Intersection(poly.geom, st_transform(line.way, 4326))::geography) ELSE 0 END) as construction,
sum(CASE WHEN highway = 'primary' THEN ST_Length(ST_Intersection(poly.geom, st_transform(line.way, 4326))::geography) ELSE 0 END) as primary,
sum(CASE WHEN highway = 'secondary' THEN ST_Length(ST_Intersection(poly.geom, st_transform(line.way, 4326))::geography) ELSE 0 END) as secondary,
sum(CASE WHEN highway = 'track' THEN ST_Length(ST_Intersection(poly.geom, st_transform(line.way, 4326))::geography) ELSE 0 END) as track
FROM tl_2016_us_county poly, planet_osm_line line
WHERE poly.statefp = '24'
  AND ST_Intersects(poly.geom, st_transform(line.way, 4326)) 
  AND line.highway IS NOT NULL
GROUP BY poly.gid;
