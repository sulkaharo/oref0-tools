## oref0 tools

This is Sulka's repository of tools used with the oref0 closed loop artificial pancreas and Nightscout

## Installation

```
git clone git@github.com:sulkaharo/oref0-tools
cd oref0-tools
npm install
```

## Nightscout statistics

The bin/get-nightscout-stats.js tool runs map-reduce jobs on your Nightscout database and spits out CSV files for importing to a spreadsheet for visualisation.

Usage:

`node bin/get-nightscout-stats.js insulincorrections  -u databaseuser:password@8host:port/databasename -c datacollectionname`

***Note the script is finicky about being pointed to the right collection. If you point it to a wrong collection, it'll just display empty results.***

Available commands:

`insulincorrections`returns average number of insulin corrections given / week. Data is provided for both the entire 24 hour period as well as averages for day and night time (treatment events where insulin > 0 and carbs = 0).

`carbcorrections` is similar to insulincorrections, but for carb corrections (treatment events where carbs > 0 and insulin == 0)

`glucose2` exports the weekly glucose distribution numbers as shown in Nightscout distribution statistics

