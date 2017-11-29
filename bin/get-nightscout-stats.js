'use strict';

var mongojs = require('mongojs');
var uuid = require('uuid');
var json2csv = require('json2csv');


/// TREATMENTS STATS

var treatmentsProcessors = {};
var runtimeInfo = {};

treatmentsProcessors.mapper = function map_treatments() {


    if (isNaN(this.insulin)) return;
    if (!isNaN(this.carbs) && Number(this.carbs) > 0) return;

    var date = new Date(this.created_at);
    var insulin = Number(this.insulin);

    if (insulin == 0) return;

    var dateKey = new Date(this.created_at).toISOString().slice(0, 10).replace(/-/g, "");
    var yearweekKey = getYearWeek(date);

    emit(yearweekKey, {
        sum: insulin, // the field you want stats for
        count: 1,
        avg: 0,
        treatmentsPerDay: 0
    });

    var dayTimeKey = (date.getHours() >= 21 ||  date.getHours() <= 7) ? "night" : "day";

    emit(yearweekKey + "/" + dayTimeKey, {
        sum: insulin, // the field you want stats for
        count: 1,
        avg: 0,
        treatmentsPerDay: 0
    });

}

treatmentsProcessors.reducer = function reduce_treatments(key, values) {
    var a = values[0]; // will reduce into here
    for (var i = 1 /*!*/ ; i < values.length; i++) {
        var b = values[i]; // will merge 'b' into 'a'

        // temp helpers
        var delta = a.sum / a.count - b.sum / b.count; // a.mean - b.mean
        var weight = (a.count * b.count) / (a.count + b.count);

        // do the reducing
        a.sum += b.sum;
        a.count += b.count;
    }

    return a;
}

treatmentsProcessors.finalizer = function finalize_treatments(key, value) {

    value.avg = value.sum / value.count;
    value.treatmentsPerDay = value.count / 7.0;

    return value;
}

var carbCorrectionsProcessors = {};

carbCorrectionsProcessors.mapper = function map_carbcorrections() {
    if (!isNaN(this.insulin) && Number(this.insulin) > 0) return;
    if (isNaN(this.carbs)) return;

    var date = new Date(this.created_at);
    var carbs = Number(this.carbs);

    var dateKey = new Date(this.created_at).toISOString().slice(0, 10).replace(/-/g, "");
    var yearweekKey = getYearWeek(date);

    emit(yearweekKey, {
        sum: carbs, // the field you want stats for
        count: 1,
        avg: 0,
        treatmentsPerDay: 0
    });

    var dayTimeKey = (date.getHours() >= 21 ||  date.getHours() <= 7) ? "night" : "day";

    emit(yearweekKey + "/" + dayTimeKey, {
        sum: carbs, // the field you want stats for
        count: 1,
        avg: 0,
        treatmentsPerDay: 0
    });
}

carbCorrectionsProcessors.reducer = treatmentsProcessors.reducer;
carbCorrectionsProcessors.finalizer = treatmentsProcessors.finalizer;

/// SGV processor

var glucoseProcessor = {};

glucoseProcessor.mapper = function map_treatments() {

    if (isNaN(this.sgv)) return;
    var sgv = Number(this.sgv);
    var low = (sgv < 3.7 * 18) ? 1 : 0;
    var high = (sgv >= 10 * 18) ? 1 : 0;
    var date = new Date(this.date);

    var m = date.getMonth() + 1;
    var pad = (m >= 10) ? "" : "0";

    var monthKey = date.getFullYear() + "-" + pad + m;

    emit(monthKey, {
        sum: sgv, // the field you want stats for
        min: sgv,
        max: sgv,
        count: 1,
        lowcount: low,
        highcount: high,
        diff: 0, // M2,n:  sum((val-mean)^2)
    });

    var dayTimeKey = (date.getHours() >= 22 ||  date.getHours() <= 7) ? "night" : "day";

    emit(monthKey + "/" + dayTimeKey, {
        sum: sgv, // the field you want stats for
        min: sgv,
        max: sgv,
        count: 1,
        lowcount: low,
        highcount: high,
        diff: 0, // M2,n:  sum((val-mean)^2)
    });

}

glucoseProcessor.reducer = function reduce(key, values) {
    var a = values[0]; // will reduce into here
    for (var i = 1 /*!*/ ; i < values.length; i++) {
        var b = values[i]; // will merge 'b' into 'a'

        // temp helpers
        var delta = a.sum / a.count - b.sum / b.count; // a.mean - b.mean
        var weight = (a.count * b.count) / (a.count + b.count);

        // do the reducing
        a.diff += b.diff + delta * delta * weight;
        a.sum += b.sum;
        a.count += b.count;
        a.lowcount += b.lowcount;
        a.highcount += b.highcount;
        a.min = Math.min(a.min, b.min);
        a.max = Math.max(a.max, b.max);
    }

    return a;
}

glucoseProcessor.finalizer = function finalizer(key, value) {

    var mmolDivisor = 18;

    value.avg = value.sum / value.count / mmolDivisor;
    value.variance = value.diff / value.count;
    value.stddev = Math.sqrt(value.variance) / mmolDivisor;
    value.high = value.highcount / value.count;
    value.low = value.lowcount / value.count;
    value.a1c = (((value.sum / value.count) + 46.7) / 28.7).toFixed(1);
    value.min = value.min / mmolDivisor;
    value.max = value.max / mmolDivisor;

    return value;
}


/// SGV processor

var glucoseProcessor2 = {};

glucoseProcessor2.mapper = function map_treatments() {

    if (isNaN(this.sgv)) return;
    var sgv = Number(this.sgv);
    if (sgv > 30*18) return;
    var date = new Date(this.date);

    var m = date.getMonth() + 1;
    var pad = (m >= 10) ? "" : "0";

    var monthKey = date.getFullYear() + "-" + pad + m;

    var uniq = {};
    uniq[date.getTime()] = true;

    var record = {
        'sgv': sgv,
        'date': date
    };

    emit(monthKey, {
        'uniq': uniq,
        'records': [record]
    });
/*
    var dayTimeKey = (date.getHours() >= 22 ||  date.getHours() <= 7) ? "night" : "day";

    emit(monthKey + "/" + dayTimeKey, {
        'uniq': uniq,
        'records': [record]
    });
*/
}

glucoseProcessor2.reducer = function reduce(key, values) {
    var a = values[0];

    for (var i = 1 /*!*/ ; i < values.length; i++) {
        var b = values[i];

        for (var j = 0; j < b.records.length; j++) {
            var r = b.records[j];
            if (a.uniq.hasOwnProperty(r.date.getTime())) {
                continue;
            }
            a.uniq[r.date.getTime()] = true;
            a.records.push(r);
        }
    }

    return a;
}

glucoseProcessor2.finalizer = function finalizer(key, value) {

    // free sone RAM
    delete value.uniq;
    
    // sort the data

    var data = value.records;

    data.sort(function(a, b) {
        return a.date.getTime() - b.date.getTime();
    });

    var glucose_data = [data[0]];

    // data cleaning pass 1 - add interpolated missing points

    for (var i = 0; i < data.length - 2; i++) {

        var entry = data[i];
        var nextEntry = data[i + 1];

        var timeDelta = nextEntry.date.getTime() - entry.date.getTime();

        if (timeDelta < 9 * 60 * 1000 ||  timeDelta > 25 * 60 * 1000) {
            glucose_data.push(entry);
            continue;
        }

        var missingRecords = Math.floor(timeDelta / (5 * 60 * 990)) - 1;

        var timePatch = Math.floor(timeDelta / (missingRecords + 1));
        var bgDelta = (nextEntry.sgv - entry.sgv) / (missingRecords + 1);

        glucose_data.push(entry);

        for (var j = 1; j <= missingRecords; j++) {

            var bg = Math.floor(entry.sgv + bgDelta * j);
            var t = new Date(entry.date.getTime() + j * timePatch);
            var newEntry = {
                sgv: bg,
                date: t
            };
            glucose_data.push(newEntry);
        }

    }

    // data cleaning pass 2 - replace single jumpy measures with interpolated values

    var glucose_data2 = [glucose_data[0]];

    var prevEntry = glucose_data[0];

    for (var i = 1; i < glucose_data.length - 2; i++) {

        //     var prevEntry = glucose_data[i-1];
        var entry = glucose_data[i];
        var nextEntry = glucose_data[i + 1];

        var timeDelta = nextEntry.date.getTime() - entry.date.getTime();
        var timeDelta2 = entry.date.getTime() - nextEntry.date.getTime();

        var maxGap = (5 * 60 * 1000) + 10000;

        if (timeDelta > maxGap ||  timeDelta2 > maxGap) {
            glucose_data2.push(entry);
            prevEntry = entry;
            continue;
        }

        var delta1 = entry.sgv - prevEntry.sgv;
        var delta2 = nextEntry.sgv - entry.sgv;

        if (delta1 <= 8 && delta2 <= 8) {
            glucose_data2.push(entry);
            prevEntry = entry;
            continue;
        }

        if ((delta1 > 0 && delta2 < 0) ||  (delta1 < 0 && delta2 > 0)) {
            var d = (nextEntry.sgv - prevEntry.sgv) / 2;
            var newEntry = {
                sgv: prevEntry.sgv + d,
                date: entry.date
            };
            glucose_data2.push(newEntry);
            prevEntry = newEntry;
            continue;

        }

        glucose_data2.push(entry);
        prevEntry = entry;
    }

    glucose_date = glucose_data2;

    // now do the actual analytics

    value.sum = 0;
    value.lowCount = 0;
    value.highCount = 0;

    for (var i = 0; i < glucose_data.length; i++) {
        var r = glucose_data[i];
        value.sum += r.sgv;
        value.lowCount += (r.sgv < 3.7 * 18) ? 1 : 0;
        value.highCount += (r.sgv >= 10 * 18) ? 1 : 0;
    }

    value.count = glucose_data.length;
    value.avg = value.sum / value.count;
    value.low = value.lowCount / value.count;
    value.high = value.highCount / value.count;

    var v = 0;

    for (var i = 0; i < glucose_data.length; i++) {
        var r = glucose_data[i];
        v += Math.pow(r.sgv - value.avg, 2);
    }

    value.variance = v / value.count;
    value.stddev = Math.sqrt(value.variance);

    delete value.uniq;
    delete value.recods;

    value.tir = 1.0 - (value.low + value.high);

    var total = 0;
    var events = 0;

	var GVITotal = 0;
	var GVIIdeal = 0;

	var usedRecords = 0;
	var glucoseTotal = 0;
	var deltaTotal = 0;

    for (var i = 0; i < glucose_data.length - 2; i++) {

        var entry = glucose_data[i];
        var nextEntry = glucose_data[i + 1];

        var timeDelta = nextEntry.date.getTime() - entry.date.getTime();

        if (timeDelta > 6 * 60 * 1000) {
//            console.log("Record skipped");
            continue;
        }
        
        usedRecords += 1;

        var delta = Math.abs(nextEntry.sgv - entry.sgv);
        
        deltaTotal += delta;

        total += delta;
        events += 1;
        
       GVITotal += Math.sqrt(25 + Math.pow(delta, 2));  
       glucoseTotal +=  entry.sgv;
       
    }
    
	var GVIDelta = Math.floor(glucose_data[0].sgv,glucose_data[glucose_data.length-1].sgv);
	
    GVIIdeal = Math.sqrt(Math.pow(usedRecords*5,2) + Math.pow(GVIDelta,2));
    
    var GVI = Math.round(GVITotal / GVIIdeal * 100) / 100;

    var glucoseMean = Math.floor(glucoseTotal / usedRecords);

    var PGS = Math.round(GVI * glucoseMean * (1-value.tir) * 100) / 100;

	var days = (glucose_data[glucose_data.length-1].date.getTime() - glucose_data[0].date.getTime()) / (24*60*60*1000.0);

	var TDC = deltaTotal / days;
    var TDCHourly = TDC / 24.0;
    
    value.days = days;
    
    value.gvi = GVI;
    value.pgs = PGS;
    value.tdc = TDC;
    value.tdcHourly = TDCHourly;

    value.a1c = (((value.sum / value.count) + 46.7) / 28.7).toFixed(1);
    value.tdcmmol = value.tdc / 18.0;
    value.stddevmmol = value.stddev / 18.0;

    return value;
}

/// code to run this

var argv = require('yargs')
    .usage('$0 <cmd> [args]')
    .option('url', {
        alias: 'u',
        describe: 'Mongo database URL'
    })
    .option('collection', {
        alias: 'c',
        describe: 'Mongo collection with treatment data'
    })
    .option('treatments', {
        alias: 't',
        describe: 'Mongo collection, which contains the treatments data',
        default: 'treatments'
    })
    .demand(['c', 'u'])
    .global(['c', 'u'])
    .command('insulincorrections', 'Insulin correction stats', {}, function(argv) {
        //      console.log('running insulin correction stats');

        var fieldmappings = [{
                label: 'week',
                value: function(row) {
                    return row._id.split('/')[0];
                }
            },
            {
                label: 'timeofday',
                value: function(row) {
                    return row._id.split('/')[1];
                }
            },
            {
                label: 'total_insulin',
                value: 'value.sum'
            },
            {
                label: 'average_carbs',
                value: function(row) {
                    return row.value.avg.toFixed(2);
                }
            },
            {
                label: 'average_insulin_corrections_per_day',
                value: function(row) {
                    return row.value.treatmentsPerDay.toFixed(2);
                }
            }
        ];

        runtimeInfo.argv = argv;
        runtimeInfo.processors = treatmentsProcessors;
        runtimeInfo.fieldmappings = fieldmappings;
        runStats();
    })
    .command('carbcorrections', 'Carb correction stats', {}, function(argv) {
        //      console.log('running insulin correction stats');

        var fieldmappings = [{
                label: 'week',
                value: function(row) {
                    return row._id.split('/')[0];
                }
            },
            {
                label: 'timeofday',
                value: function(row) {
                    return row._id.split('/')[1];
                }
            },
            {
                label: 'total_carbs',
                value: 'value.sum'
            },
            {
                label: 'average_carbs',
                value: function(row) {
                    return row.value.avg.toFixed(2);
                }
            },
            {
                label: 'average_carb_corrections_per_day',
                value: function(row) {
                    return row.value.treatmentsPerDay.toFixed(2);
                }
            }
        ];

        runtimeInfo.argv = argv;
        runtimeInfo.processors = carbCorrectionsProcessors;
        runtimeInfo.fieldmappings = fieldmappings;
        runStats();
    })
    .command('glucose', 'Glucose stats', {}, function(argv) {
        //      console.log('running insulin correction stats');

        var fieldmappings = [{
                label: 'month',
                value: function(row) {
                    return row._id.split('/')[0];
                }
            },
            {
                label: 'timeofday',
                value: function(row) {
                    return row._id.split('/')[1];
                }
            },
            {
                label: 'mean',
                value: 'value.avg'
            },
            {
                label: 'variance',
                value: 'value.variance'
            },
            {
                label: 'SD',
                value: 'value.stddev'
            },
            {
                label: 'high',
                value: 'value.high'
            },
            {
                label: 'low',
                value: 'value.low'
            },
            {
                label: 'a1c',
                value: 'value.a1c'
            }
        ];

        runtimeInfo.argv = argv;
        runtimeInfo.processors = glucoseProcessor;
        runtimeInfo.fieldmappings = fieldmappings;
        runStats();
    })
    .command('glucose2', 'Glucose stats', {}, function(argv) {
        //      console.log('running insulin correction stats');

        var fieldmappings = [{
                label: 'month',
                value: function(row) {
                    return row._id.split('/')[0];
                }
            },
            {
                label: 'count',
                value: 'value.count'
            } ,
            {
                label: 'gvi',
                value: 'value.gvi'
            },
            {
                label: 'pgs',
                value: 'value.pgs'
            },
            {
                label: 'tir',
                value: 'value.tir'
            } ,
            {
                label: 'low',
                value: 'value.low'
            },
            {
                label: 'high',
                value: 'value.high'
            },
            {
                label: 'stddev',
                value: 'value.stddev'
            },
            {
                label: 'tdc',
                value: 'value.tdc'
            },
            {
                label: 'days',
                value: 'value.days'
            },
            {
                label: 'stddevmmol',
                value: 'value.stddevmmol'
            }
            ,
            {
                label: 'tdcmmol',
                value: 'value.tdcmmol'
            }
            ,
            {
                label: 'a1c',
                value: 'value.a1c'
            }
        ];

        runtimeInfo.argv = argv;
        runtimeInfo.processors = glucoseProcessor2;
        runtimeInfo.fieldmappings = fieldmappings;
        runStats();
    })
    .argv;



function getConnection() {
    //	console.log("Opening MongoDB connection");
    var collections = [];

    var argv = runtimeInfo.argv;

    if (!argv.c) {
        argv.c = "treatments";
    }
    collections[0] = argv.c;

    // increase timeout to > 3 minutes in case there's a lot of data
    var socketOptions = {
        connectTimeoutMS: 200000,
        socketTimeoutMS: 200000
    };

    return mongojs(argv.u, collections, {
        socketOptions
    });
}

function dumpCollectionAndExit() {

    runtimeInfo.tempCollection.find(function(err, results) {

        try {
            var result = json2csv({
                data: results,
                fields: runtimeInfo.fieldmappings
            });
            console.log(result);
        } catch (err) {
            // Errors are thrown for bad options, or if the data is empty and no fields are provided. 
            // Be sure to provide fields if it is possible that your data array will be empty. 
            console.error(err);
        }

        runtimeInfo.tempCollection.drop();

        process.exit();
    });

}

function runMapReduceAndDump() {

    runtimeInfo.tempCollection = runtimeInfo.db.collection(runtimeInfo.tempCollectionName);

    runtimeInfo.sourceCollection.mapReduce(
        runtimeInfo.processors.mapper,
        runtimeInfo.processors.reducer, {
            out: {
                merge: runtimeInfo.tempCollectionName
            },
            finalize: runtimeInfo.processors.finalizer
        },
        function mrDone() {
            dumpCollectionAndExit(runtimeInfo);
        }
    );
}

function runStats() {
    var db = getConnection(runtimeInfo.argv);
    runtimeInfo.db = db;
    runtimeInfo.sourceCollection = db.collection(runtimeInfo.argv.c);
    runtimeInfo.tempCollectionName = String(uuid.v1());
    db.createCollection(runtimeInfo.tempCollectionName, {}, runMapReduceAndDump);
}