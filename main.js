var esprima = require("esprima");
var options = {tokens:true, tolerant: true, loc: true, range: true };
var faker = require("faker");
var fs = require("fs");
faker.locale = "en";
var mock = require('mock-fs');
var _ = require('underscore');
var Random = require('random-js');

function main()
{
	var args = process.argv.slice(2);

	if( args.length == 0 )
	{
		args = ["subject.js"];
	}
	var filePath = args[0];

	constraints(filePath);

	generateTestCases()

}

var engine = Random.engines.mt19937().autoSeed();

function createConcreteIntegerValue( greaterThan, constraintValue )
{
	if( greaterThan )
		return Random.integer(constraintValue,constraintValue+10)(engine);
	else
		return Random.integer(constraintValue-10,constraintValue)(engine);
}

function Constraint(properties)
{
	this.ident = properties.ident;
	this.expression = properties.expression;
	this.operator = properties.operator;
	this.value = properties.value;
	this.funcName = properties.funcName;
	this.kind = properties.kind; // Supported kinds: "fileWithContent","fileExists", integer, string, phoneNumber
}

function fakeDemo()
{
	console.log( faker.phone.phoneNumber() );
	console.log( faker.phone.phoneNumberFormat() );
	console.log( faker.phone.phoneFormats() );
}

var functionConstraints =
{
}

var mockFileLibrary = 
{
	pathExists:
	{
		'path/fileExists': {}
	},
	fileWithContent:
	{
		pathContent: 
		{	
  			file1: 'text content',
		}
	}
};

function allPossibleCases(arr) {
  if (arr.length == 1) {
    return arr[0];
  } else {
    var result = [];
    var allCasesOfRest = allPossibleCases(arr.slice(1));  // recur with the rest of array
    for (var i = 0; i < allCasesOfRest.length; i++) {
      for (var j = 0; j < arr[0].length; j++) {
        result.push(arr[0][j] + '|' + allCasesOfRest[i]);
      }
    }
    return result;
  }
}

function generateTestCases()
{

	var content = "var subject = require('./subject.js')\n";
	content += "var mock = require('mock-fs');\n";

	for ( var funcName in functionConstraints )
	{	
		// update parameter values based on known constraints.
		var constraints = functionConstraints[funcName].constraints;

		//Initialize the 
		var params = {};
		for (var i =0; i < functionConstraints[funcName].params.length; i++ )
		{
			var paramName = functionConstraints[funcName].params[i];
			params[paramName] = ['\'\''];
		}

		// Something where we run the all possible combination of indent values.
		// indent : [list of values] 

		// handle non-mock based constraints
		for( var c = 0; c < constraints.length; c++ )
		{
			var constraint = constraints[c];
			
			if( params.hasOwnProperty( constraint.ident ) )
			{
				params[constraint.ident].push(constraint.value);
			}
		}


		console.log(params);

		var result = allPossibleCases( Object.keys(params).map(function(x) {return params[x]}) );

		//console.log(result);

		console.log("############");

		
		result.forEach(console.log);

		for(var i = result.length - 1 ; i >= 0 ; i-- ){
			content += "subject.{0}({1});\n".format(funcName, result[i].split('|').join(',') )
		}
	}

	fs.writeFileSync('test.js', content, "utf8");
}

function generateMockFsTestCases (pathExists,fileWithContent,funcName,args) 
{
	var testCase = "";
	// Build mock file system based on constraints.
	var mergedFS = {};
	if( pathExists )
	{
		for (var attrname in mockFileLibrary.pathExists) { mergedFS[attrname] = mockFileLibrary.pathExists[attrname]; }
	}
	if( fileWithContent )
	{
		for (var attrname in mockFileLibrary.fileWithContent) { mergedFS[attrname] = mockFileLibrary.fileWithContent[attrname]; }
	}

	testCase += 
	"mock(" +
		JSON.stringify(mergedFS)
		+
	");\n";

	testCase += "\tsubject.{0}({1});\n".format(funcName, args );
	testCase+="mock.restore();\n";
	return testCase;
}

function constraints(filePath)
{
    var buf = fs.readFileSync(filePath, "utf8");
	var result = esprima.parse(buf, options);

	traverse(result, function (node) {
		if (node.type === 'FunctionDeclaration') {
			var funcName = functionName(node);
			console.log("Line : {0} Function: {1}".format(node.loc.start.line, funcName ));

			var params = node.params.map(function(p) {return p.name});

			functionConstraints[funcName] = {constraints:[], params: params};

			// Check for expressions using argument.
			traverse(node, function(child)
			{	
				var binEquality = child.type === 'BinaryExpression' 
					&& ["==", "<", "!=", ">"].indexOf(child.operator) > -1 
					&& child.left.type == 'Identifier' 
					&& params.indexOf( child.left.name ) > -1 ;

				var strEquality = binEquality && typeof child.right.value === 'string';
				var intEquality = binEquality && typeof child.right.value === 'number';

				// get expression from original source code:
				if(binEquality){
					var expression = buf.substring(child.range[0], child.range[1]);
					var rightHand = buf.substring(child.right.range[0], child.right.range[1])
				}

				if( strEquality ) {		
					functionConstraints[funcName].constraints.push( 
					new Constraint(
					{
						ident: child.left.name,
						value: '"' + child.right.value + '"', 
						funcName: funcName,
						kind: "string",
						operator : child.operator,
						expression: expression
					}));

					functionConstraints[funcName].constraints.push( 
					new Constraint(
					{
						ident: child.left.name,
						value: '"' + Random.string()(engine, child.right.value.length) + '"' ,
						funcName: funcName,
						kind: "string",
						operator : child.operator,
						expression: expression
					}));

				} else if( intEquality ) {

					// case 1: Pass the same value to satisfy equality
					functionConstraints[funcName].constraints.push( 
					new Constraint(
					{
						ident: child.left.name,
						value: parseInt(rightHand, 10),
						funcName: funcName,
						kind: "integer",
						operator : child.operator,
						expression: expression
					}));

					// case 2: Pass rightHand - 1 to satisfy '<' and '!='
					functionConstraints[funcName].constraints.push( 
					new Constraint(
					{
						ident: child.left.name,
						value: parseInt(rightHand, 10) - 1,
						funcName: funcName,
						kind: "integer",
						operator : child.operator,
						expression: expression
					}));

					// case 3: Pass rightHand + 1 to satisfy '>' and '!='
					functionConstraints[funcName].constraints.push( 
					new Constraint(
					{
						ident: child.left.name,
						value: parseInt(rightHand, 10) + 1,
						funcName: funcName,
						kind: "integer",
						operator : child.operator,
						expression: expression
					}));

				} else if ( binEquality ) {
					// Add two values : one which satisfies the branch and one which does not.
					functionConstraints[funcName].constraints.push( 
					new Constraint(
					{
						ident: child.left.name,
						value: rightHand,
						funcName: funcName,
						kind: "undefined",
						operator : child.operator,
						expression: expression
					}));
				}

				var logicalAnd = child.type === 'LogicalExpression' && child.operator === '&&';

				if(logicalAnd){
					console.log("---------");
				}

			});
		}
	});
}

function parseBooleanExpression(node){
	if(node.type !== 'BinaryExpression') return false;
}

function parseLogicalExpression(node){
	if(node.type !== 'LogicalExpression') return false;
}

function traverse(object, visitor) 
{
    var key, child;

    visitor(object);
    for (key in object) {
        if (object.hasOwnProperty(key)) {
            child = object[key];
            if (typeof child === 'object' && child !== null) {
                traverse(child, visitor);
            }
        }
    }
}

function traverseWithCancel(object, visitor)
{
    var key, child;

    if( visitor(object) )
    {
	    for (key in object) {
	        if (object.hasOwnProperty(key)) {
	            child = object[key];
	            if (typeof child === 'object' && child !== null) {
	                traverseWithCancel(child, visitor);
	            }
	        }
	    }
 	}
}

function functionName( node )
{
	if( node.id )
	{
		return node.id.name;
	}
	return "";
}


if (!String.prototype.format) {
  String.prototype.format = function() {
    var args = arguments;
    return this.replace(/{(\d+)}/g, function(match, number) { 
      return typeof args[number] != 'undefined'
        ? args[number]
        : match
      ;
    });
  };
}

main();
