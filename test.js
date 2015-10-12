var subject = require('./mystery.js')
var mock = require('mock-fs');
subject.inc(31,undefined);
subject.inc(29,undefined);
subject.inc(30,undefined);
subject.inc('',undefined);
subject.inc(31,'');
subject.inc(29,'');
subject.inc(30,'');
subject.inc('','');
subject.format('','','');
