'use strict'

const pgp = require('pg-promise')();
const download = require('download-file');
const exec = require('child_process').exec;
const fs = require('fs');

const connectionString = 'postgres://postgres:postgres@localhost:5432/osm';

const db = pgp(connectionString);

let i = 0;

const output = fs.createWriteStream('./output/stragglers2.csv', {'flags': 'a'})

// header row
// output.write('statefp,countyfp,name,unclassified, footway, motorway, proposed, abandoned, tertiary, trunk, residential_link, raceway, tertiary_link, motorway_link, steps, bridleway, pedestrian, conveyor, turning_loop, secondary_link, primary_link, escape, service, cycleway, trunk_link, bus_guideway, living_street, path, residential, road, corridor, rest_area, disused, construction,primary,secondary,track\n')


processCounty()

function processCounty() {
  console.log(i)
  // const sql = `SELECT statefp, countyfp, name, st_asgeojson(st_envelope(geom)) as bbox from tl_2016_us_county LIMIT 1 OFFSET ${i}`


  const sql = `
  SELECT * 
  FROM (
    SELECT a.statefp, a.countyfp, a.name, st_asgeojson(st_envelope(a.geom)) as bbox, b.name as outname FROM tl_2016_us_county a LEFT JOIN output b on a.geoid = b.fips
  ) x 
  WHERE outname IS NULL
  LIMIT 1 OFFSET ${i}
`

console.log('Getting bbox for the next county...')
db.any(sql)
  .then((data) => {
    const coordinates = JSON.parse(data[0].bbox).coordinates;
    console.log(`Got bbox for ${data[0].name} county in state ${data[0].statefp}.`)

    const state = data[0].statefp;
    const county = data[0].countyfp;

    const bbox = {
      s: coordinates[0][0][1],
      w: coordinates[0][0][0],
      e: coordinates[0][2][0],
      n: coordinates[0][2][1],
    }

    const url = `http://overpass-api.de/api/interpreter?data=way["highway"](${bbox.s},${bbox.w},${bbox.n},${bbox.e});(._;>;);out;`

    console.log('Downloading OSM data...')
    download(url, {
      directory: './temp',
      filename: `${state}${county}.osm`
    }, (err) => {
      if (err) {
        console.log('error, trying again in 10 seconds', err)
        setTimeout(processCounty, 10000)
        return
      }

      console.log('Done.  Loading data into PostGIS...')

      const command = `osm2pgsql -c -d osm -U postgres -H localhost -S osm2pgsql/default.style temp/${state}${county}.osm`

      exec(command, (error, stdout, stderr) => {
        console.log('stdout: ' + stdout);
        console.log('stderr: ' + stderr);
        if (error !== null) {
            console.log('exec error: ' + error);
        }

        console.log('Done.  Querying Data...')

        queryOSMData(state, county)
      });
    }) 
  })
}



function queryOSMData(state, county) {
    const sql = `
      WITH poly as (
        SELECT gid, statefp, countyfp, name, geom 
        FROM tl_2016_us_county 
        WHERE statefp='${state}'
        AND countyfp='${county}'
      )

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
      FROM poly, planet_osm_line line
      WHERE ST_Intersects(poly.geom, st_transform(line.way, 4326))
        AND line.highway IS NOT NULL
      GROUP BY poly.gid, poly.statefp, poly.countyfp, poly.name
    `


    db.any(sql)
      .then((data) => {
        console.log('Done', data)

        const d = data[0];

        if(data.length > 0) {
          output.write(`${d.statefp},${d.countyfp},${d.name},${d.unclassified},${d.footway},${d.motorway},${d.proposed},${d.abandoned},${d.tertiary},${d.trunk},${d.residential_link},${d.raceway},${d.tertiary_link},${d.motorway_link},${d.steps},${d.bridleway},${d.pedestrian},${d.conveyor},${d.turning_loop},${d.secondary_link},${d.primary_link},${d.escape},${d.service},${d.cycleway},${d.trunk_link},${d.bus_guideway},${d.living_street},${d.path},${d.residential},${d.road},${d.corridor},${d.rest_area},${d.disused},${d.construction},${d.primary},${d.secondary},${d.track}\n`)
        }

        i += 1;
        processCounty()
      })
      .catch(err => {
        console.log(err)
      })
  }