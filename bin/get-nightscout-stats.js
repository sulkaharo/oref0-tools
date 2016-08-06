'use strict';

var mongojs = require('mongojs');
var uuid = require('uuid');
var json2csv = require('json2csv');


/// TREATMENTS STATS

var treatmentsProcessors = {};

treatmentsProcessors.mapper = function map_treatments() {
	if (!isNaN(this.insulin) && Number(this.insulin) > 0) return;
	if (isNaN(this.carbs)) return;

	var date = new Date(this.created_at);
	var carbs = Number(this.carbs);
	
	var dateKey = new Date(this.created_at).toISOString().slice(0,10).replace(/-/g,"");
	var yearweekKey = getYearWeek(date);

	emit( yearweekKey,
         {sum: carbs, // the field you want stats for
          count:1,
          avg: 0,
          treatmentsPerDay: 0
    });
    
    var dayTimeKey = (date.getHours() >= 21 || date.getHours() <= 7) ? "night" : "day";
    
    emit( yearweekKey + "/" + dayTimeKey,
         {sum: carbs, // the field you want stats for
          count:1,
          avg: 0,
          treatmentsPerDay: 0
    });
}

treatmentsProcessors.reducer = function reduce_treatments(key, values) {
    var a = values[0]; // will reduce into here
    for (var i=1/*!*/; i < values.length; i++){
        var b = values[i]; // will merge 'b' into 'a'

        // temp helpers
        var delta = a.sum/a.count - b.sum/b.count; // a.mean - b.mean
        var weight = (a.count * b.count)/(a.count + b.count);
        
        // do the reducing
        a.sum += b.sum;
        a.count += b.count;
    }

    return a;
}

treatmentsProcessors.finalizer = function finalize_treatments(key, value){

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
	
	var dateKey = new Date(this.created_at).toISOString().slice(0,10).replace(/-/g,"");
	var yearweekKey = getYearWeek(date);

	emit( yearweekKey,
         {sum: carbs, // the field you want stats for
          count:1,
          avg: 0,
          treatmentsPerDay: 0
    });
    
    var dayTimeKey = (date.getHours() >= 21 || date.getHours() <= 7) ? "night" : "day";
    
    emit( yearweekKey + "/" + dayTimeKey,
         {sum: carbs, // the field you want stats for
          count:1,
          avg: 0,
          treatmentsPerDay: 0
    });
}

carbCorrectionsProcessors.reducer = treatmentsProcessors.reducer;
carbCorrectionsProcessors.finalizer = treatmentsProcessors.finalizer;

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
    .demand(['c','u'])
    .global(['c','u'])
    .command('insulincorrections', 'Insulin correction stats', {}, function (argv) {
      console.log('running insulin correction stats');
      //var fieldmappings = ['_id','value.sum','value.avg','value.treatmentsPerDay'];
      
      var fieldmappings = [
      	{label: 'week', value: function(row) { return row._id.split('/')[0];} },
      	{label: 'timeofday', value: function(row) { return row._id.split('/')[1];}},
      	{label: 'total_insulin', value: 'value.sum' },
      	{label: 'average_carbs', value: function(row) { return row.value.avg.toFixed(2);} },
      	{label: 'average_carb_corrections_per_day', value: function(row) { return row.value.treatmentsPerDay.toFixed(2);} }
      	];
      
      runStats(argv,treatmentsProcessors,fieldmappings);
    })
    .command('carbcorrections', 'Carb correction stats', {}, function (argv) {
      console.log('running insulin correction stats');
//      var fieldmappings = ['_id','value.sum','value.avg','value.treatmentsPerDay'];
      var fieldmappings = [
      	{label: 'week', value: function(row) { return row._id.split('/')[0];} },
      	{label: 'timeofday', value: function(row) { return row._id.split('/')[1];}},
      	{label: 'total_carbs', value: 'value.sum' },
      	{label: 'average_carbs', value: function(row) { return row.value.avg.toFixed(2);} },
      	{label: 'average_carb_corrections_per_day', value: function(row) { return row.value.treatmentsPerDay.toFixed(2);} }
      	];
      

      runStats(argv,carbCorrectionsProcessors,fieldmappings);
    })
    .argv;



function getConnection(argv)
{
	console.log("Opening MongoDB connection");
	var collections = [];
	
	if (!argv.c) { argv.c = "treatments"; }
	collections[0] = argv.c;
	
	return mongojs(argv.u, collections);
}    

function dumpCollectionAndExit(collectionPointer,fields)
{

//console.log("Output results");

collectionPointer.find(function(err,results) {

	try {
	  var result = json2csv({ data: results, fields: fields });
	  console.log(result);
	} catch (err) {
 	 // Errors are thrown for bad options, or if the data is empty and no fields are provided. 
 	 // Be sure to provide fields if it is possible that your data array will be empty. 
 	 console.error(err);
	}

	collectionPointer.drop();
	
	process.exit();
});

}

function runMapReduceAndDump(processors,sourceCollection,targetCollectionName,db,fieldmappings)
{

	var tempcollection = db.collection(targetCollectionName);

	console.log("Running map / reduce");

	sourceCollection.mapReduce(
		processors.mapper,
		processors.reducer,
        {
			out: { merge: targetCollectionName },
			finalize: processors.finalizer
		},
		function mrDone()
			{
				dumpCollectionAndExit(tempcollection,fieldmappings);
			}
		);
}

function getTempCollection(argv,processors,fieldmappings,callback)
{
	var db = getConnection(argv);
	var targetCollection = db.collection(argv.c);
	var tempCollectionName = String(uuid.v1());
	db.createCollection(tempCollectionName,{}, callback(db,tempCollectionName,targetCollection,processors));
}

function runStats(argv, processors, fieldmappings)
{
	getTempCollection(argv,processors,fieldmappings,function(db,tempCollectionName,targetCollection,processors)
	{
		runMapReduceAndDump(processors,targetCollection,tempCollectionName,db,fieldmappings);

	});
};
