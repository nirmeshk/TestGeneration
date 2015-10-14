var subject = require('./mystery.js')
var mock = require('mock-fs');
subject.inc('','');
subject.inc(30,'');
subject.inc(29,'');
subject.inc(31,'');
subject.inc('',undefined);
subject.inc(30,undefined);
subject.inc(29,undefined);
subject.inc(31,undefined);
mock({"pathFile":{"someFile":"Some random text"}});
	subject.fileTest('pathFile/someFile','pathFile/someFile');
mock.restore();
mock({"pathFile":{"someFile":""}});
	subject.fileTest('pathFile/someFile','pathFile/someFile');
mock.restore();
mock({"pathFile":{}});
	subject.fileTest('pathFile/someFile','pathFile/someFile');
mock.restore();
subject.normalize('');
subject.format('','','');
subject.format('','',true);
subject.format('','',false);
subject.format('','',{shouldNormalize :true});
subject.format('','',{shouldNormalize :false});
subject.blackListNumber('');
subject.blackListNumber("523-733-8917");
subject.blackListNumber("919-623-0554");
