var esprima = require("esprima");
var options = {
	tokens: true,
	tolerant: true,
	loc: true,
	range: true
};
var faker = require("faker");
var fs = require("fs");
faker.locale = "en";
var mock = require('mock-fs');
var _ = require('underscore');
var Random = require('random-js');
var util = require('./utility.js');

function main() {
	var args = process.argv.slice(2);

	if (args.length == 0) args = ["subject.js"];

	var filePath = args[0];

	constraints(filePath);

	generateTestCases(filePath)

}

var engine = Random.engines.mt19937().autoSeed();

function Constraint(properties) {
	this.ident = properties.ident;
	this.expression = properties.expression;
	this.operator = properties.operator;
	this.value = properties.value;
	this.funcName = properties.funcName;
	this.kind = properties.kind; // Supported kinds: "fileWithContent","fileExists", integer, string, phoneNumber
}

function fakeDemo() {
	console.log(faker.phone.phoneNumber());
	console.log(faker.phone.phoneNumberFormat());
	console.log(faker.phone.phoneFormats());
}

var functionConstraints = {}

var mockFileLibrary = {

	pathWithContent: {
		pathDir: {
			someDirectory: {
				file: ''
			}
		}
	},

	pathWithoutContent: {
		pathDir: {
			someDirectory: {}
		}
	},

	pathNotExists: {
		pathDir: {}
	},

	fileWithContent: {
		pathFile: {
			someFile: 'Some random text'
		}
	},

	fileWithoutContent: {
		pathFile: {
			someFile: ''
		}
	},

	fileNotExists: {
		pathFile: {}
	}
};

function generateTestCases(filePath) {

	var content = "var subject = require('./" + filePath + "')\n";
	content += "var mock = require('mock-fs');\n";

	for (var funcName in functionConstraints) {
		// update parameter values based on known constraints.
		var constraints = functionConstraints[funcName].constraints;

		// Handle global constraints...
		var directoryRead = _.some(constraints, {
			kind: 'directoryRead'
		});
		
		var fileRead = _.some(constraints, {
			kind: 'fileRead'
		});

		var existSync_ = _.some(constraints, {
			kind: 'existSync_'
		});

		if (directoryRead || fileRead || existSync_) {
			console.log("Mocking Required for : " + funcName);

			var params = {};

			// initialize params
			for (var i = 0; i < functionConstraints[funcName].params.length; i++) {
				var paramName = functionConstraints[funcName].params[i];
				params[paramName] = '\'\'';
			}

			// plug-in values for parameters
			for (var c = 0; c < constraints.length; c++) {
				var constraint = constraints[c];
				if (params.hasOwnProperty(constraint.ident)) {
					params[constraint.ident] = constraint.value;
				}
			}

			// Prepare function arguments.
			var args = Object.keys(params).map(function(k) {
				return params[k];
			}).join(",");

			content += generateMockFsTestCases(directoryRead, fileRead, funcName, args)


		} else {
			//Initialize the 
			var params = {};
			for (var i = 0; i < functionConstraints[funcName].params.length; i++) {
				var paramName = functionConstraints[funcName].params[i];
				params[paramName] = ['\'\''];
			}

			// handle non-mock based constraints
			for (var c = 0; c < constraints.length; c++) {
				var constraint = constraints[c];
				// Something where we run the all possible combination of indent values.
				// indent : [list of values]		
				if (params.hasOwnProperty(constraint.ident)) {
					params[constraint.ident].push(constraint.value);
				}
			}

			var paramCombinations = util.allPossibleCases(Object.keys(params).map(function(x) {
				return params[x]
			}));

			//console.log('####' + funcName)
			for (var i = paramCombinations.length - 1; i >= 0; i--) {
				if (typeof paramCombinations[i] === 'object')
					content += "subject.{0}({1});\n".format(funcName, paramCombinations[i].join(','));
			}
		}
	}
	fs.writeFileSync('test.js', content, "utf8");
}

function generateMockFsTestCases(directoryRead, fileRead, funcName, args) {
	var testCase = "";

	var dirConditions = ['pathWithContent', 'pathWithoutContent', 'pathNotExists'];
	var fileConditions = ['fileWithContent', 'fileWithoutContent', 'fileNotExists'];

	var result = []

	if (directoryRead && !fileRead) {
		//Just generate the directory structure	

	} else if (!directoryRead && fileRead) {
		//Just generate the directory structure
	} else {
		//Generate all the cases of file and directory mock.
		result = util.allPossibleCases([dirConditions, fileConditions]);
		console.log(result);
	}

	// Build mock file system based on constraints.
	var mergedFS = {};
	for (var i = 0; i < result.length; i++) {
		mergedFS.pathDir = mockFileLibrary[result[i][0]].pathDir
		mergedFS.pathFile = mockFileLibrary[result[i][1]].pathFile
		testCase += "mock(" + JSON.stringify(mergedFS) + ");\n";
		testCase += "\tsubject.{0}({1});\n".format(funcName, args);
		testCase += "mock.restore();\n";
	}

	return testCase;
}

function constraints(filePath) {
	var buf = fs.readFileSync(filePath, "utf8");
	var result = esprima.parse(buf, options);

	traverse(result, function(node) {
		if (node.type === 'FunctionDeclaration') {
			var funcName = functionName(node);
			console.log("Line : {0} Function: {1}".format(node.loc.start.line, funcName));

			var params = node.params.map(function(p) {
				return p.name
			});

			functionConstraints[funcName] = {
				constraints: [],
				params: params
			};

			// Check for expressions using argument.
			traverse(node, function(child) {
				parseBooleanExpression(child, funcName, params, buf);
				parseCallExpression(child, funcName, params, buf);
			});
		}
	});
}

function parseCallExpression(child, funcName, params, buf) {
	if (!(child.type === "CallExpression" && child.callee.property && params.indexOf(child.arguments[0].name) > -1)) return false;

	// get expression from original source code:
	var expression = buf.substring(child.range[0], child.range[1]);

	switch (child.callee.property.name) {
		case "readFileSync":
			functionConstraints[funcName].constraints.push(
				new Constraint({
					ident: child.arguments[0].name,
					value: "'pathFile/someFile'",
					funcName: funcName,
					kind: "fileRead"
				}));
			break;

		case "readdirSync":
			functionConstraints[funcName].constraints.push(
				new Constraint({
					ident: child.arguments[0].name,
					value: "'pathDir/someDirectory'",
					funcName: funcName,
					kind: "directoryRead"
				}));
			break;
	}

	if (child.callee.property.name === "indexOf" && child.arguments[0].type == 'Literal') {
		for (var p = 0; p < params.length; p++) {
			if (child.callee.object.name == params[p]) {

				functionConstraints[funcName].constraints.push(
					new Constraint({
						ident: params[p],
						// A fake path to a file
						value: '"' + child.arguments[0].value + '"',
						funcName: funcName,
						kind: "string",
						operator: child.operator,
						expression: expression
					}),

					new Constraint({
						ident: params[p],
						// A fake path to a file
						value: '"asdasd' + child.arguments[0].value + '"',
						funcName: funcName,
						kind: "string",
						operator: child.operator,
						expression: expression
					}));
			}
		}
	}
}

function parseBooleanExpression(child, funcName, params, buf) {

	var binEquality = child.type === 'BinaryExpression' && ["==", "<", "!=", ">"].indexOf(child.operator) > -1 && child.left.type === 'Identifier' && params.indexOf(child.left.name) > -1;

	if (!binEquality) return false;

	var constraints = [];

	operandType = typeof child.right.value;

	// get expression from original source code:
	var expression = buf.substring(child.range[0], child.range[1]);
	var rightHand = buf.substring(child.right.range[0], child.right.range[1]);

	console.log(operandType)

	switch (operandType) {
		case 'string':
			functionConstraints[funcName].constraints.push(
				new Constraint({
					ident: child.left.name,
					value: rightHand,
					funcName: funcName,
					kind: "string",
					operator: child.operator,
					expression: expression
				}));

			functionConstraints[funcName].constraints.push(
				new Constraint({
					ident: child.left.name,
					value: '"' + Random.string()(engine, rightHand.length) + '"',
					funcName: funcName,
					kind: "string",
					operator: child.operator,
					expression: expression
				}));
			break;
		case 'number':
			// case 1: Pass the same value to satisfy equality
			functionConstraints[funcName].constraints.push(
				new Constraint({
					ident: child.left.name,
					value: parseInt(rightHand, 10),
					funcName: funcName,
					kind: "integer",
					operator: child.operator,
					expression: expression
				}));

			// case 2: Pass rightHand - 1 to satisfy '<' and '!='
			functionConstraints[funcName].constraints.push(
				new Constraint({
					ident: child.left.name,
					value: parseInt(rightHand, 10) - 1,
					funcName: funcName,
					kind: "integer",
					operator: child.operator,
					expression: expression
				}));

			// case 3: Pass rightHand + 1 to satisfy '>' and '!='
			functionConstraints[funcName].constraints.push(
				new Constraint({
					ident: child.left.name,
					value: parseInt(rightHand, 10) + 1,
					funcName: funcName,
					kind: "integer",
					operator: child.operator,
					expression: expression
				}));
			break;
		default:
			functionConstraints[funcName].constraints.push(
				new Constraint({
					ident: child.left.name,
					value: rightHand,
					funcName: funcName,
					kind: "undefined",
					operator: child.operator,
					expression: expression
				}));
	}
}

function parseLogicalExpression(child) {
	if (node.type !== 'LogicalExpression') return false;
}

function traverse(object, visitor) {
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

function traverseWithCancel(object, visitor) {
	var key, child;

	if (visitor(object)) {
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

function functionName(node) {
	if (node.id) {
		return node.id.name;
	}
	return "";
}


if (!String.prototype.format) {
	String.prototype.format = function() {
		var args = arguments;
		return this.replace(/{(\d+)}/g, function(match, number) {
			return typeof args[number] != 'undefined' ? args[number] : match;
		});
	};
}

main();