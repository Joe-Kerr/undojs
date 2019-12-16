const assert = require("assert");
const sinon = require("sinon");
const Sample = require("../../src/Undojs.js").default;


suite("Undojs.js system tests - error handling");

let sample;
const noop = ()=>{};
let callstack = [];

function delay(ms) {
	return new Promise((resolve)=>{
		setTimeout(()=>{resolve(null);}, ms);
	});
}

beforeEach(()=>{
	callstack = [];
});


test("Error in execute function is propagated", async ()=>{
	const controller = new Sample();
	
	const failAsync = {
		name: "failAsync",
		async execute() {_failAsync();},
		undo: noop
	};	
	const failSync = {
		name: "failSync",
		execute() {_failSync();},
		undo: noop
	};
	
	controller.register(failAsync);
	controller.register(failSync);
		
	await assert.rejects( async ()=>{await controller.execute("failSync");}, {message: /_failSync is not defined/} );
	await assert.rejects( async ()=>{await controller.execute("failAsync");}, {message: /_failAsync is not defined/} );
	
});

// Error in cache function is propagated
(function(tests){
	tests.forEach(async (testObj)=>{
		const failCall = {};
		const execSync = testObj.execSync;
		const cacheSync = testObj.cacheSync;
		
		const execMode = (execSync) ? "sync" : "async"; 
		const cacheMode = (cacheSync) ? "sync" : "async";
		
		const description = `Error in ${cacheMode} cache function with ${execMode} exec function is propagated`;
		
		const execute = (execSync) ? ()=>{} : async ()=>{}
		const cache = (cacheSync) ? ()=>{syncCacheFail();} : async ()=>{asyncCacheFail();}
		
		// test()
		await test(description, async ()=>{
			const controller = new Sample();
			controller.register({
				name: "fails",
				execute,
				cache,
				undo: noop
			});
			
			await assert.rejects( async ()=>{await controller.execute("fails");}, {message: /is not defined/} );
		});
		
	});
})([
	{execSync: true, cacheSync: true},
	{execSync: false, cacheSync: true},
	{execSync: true, cacheSync: false},
	{execSync: false, cacheSync: false}
])


test("Error in batched excute function is propagated", async ()=>{
	const controller = new Sample();
	
	const fails = {name: "fails", async execute() {doFail();}, undo: noop}
	const works = {name: "works", execute: noop, undo: noop}

	controller.register(fails);
	controller.register(works);	
	
	await assert.rejects( async ()=>{ 		
		await Promise.all( controller.recordBatch([{name: "works"}, {name: "fails"}, {name: "works"}]) ); 		
	}, {message: /doFail is not defined/} );
});

test("Error in single undo function is propagated", async ()=>{
	const controller = new Sample();
	
	const failAsync = {
		name: "failAsync",
		execute: noop,
		async undo() {asyncUndoFail();}
	};	
	const failSync = {
		name: "failSync",
		execute: noop,
		undo() {syncUndoFail();}
	};
	
	controller.register(failAsync);
	controller.register(failSync);
	
	await controller.execute("failSync");
	await assert.rejects( async ()=>{ await controller.undo(); }, {message: /syncUndoFail is not defined/} );
	
	//controller.callStack = [];
	
	await controller.execute("failAsync");
	await assert.rejects( async ()=>{ await controller.undo(); }, {message: /asyncUndoFail is not defined/} );
	
});

test("Error in pending undo function is propagated", async ()=>{
	const controller = new Sample();
	
	const works = {name: "works", execute: noop, async undo() {await delay(10);}}	
	const fails = {name: "fails", execute: noop, async undo() {doFail();}}	
	
	controller.register(fails);
	controller.register(works);		
	
	await Promise.all([
		controller.execute("works"),
		controller.execute("fails"),
		controller.execute("works")
	]);

	const calls = [
		controller.undo(),
		controller.undo(),
		controller.undo()
	];
	
	//await Promise.all(calls);
	await assert.rejects( async ()=>{ await Promise.all(calls); }, {message: /doFail is not defined/} );
});

test("Error in undo function of batch is propagated", async ()=>{
	const controller = new Sample();
	
	const failAsync = {
		name: "failAsync",
		execute: noop,
		async undo() {asyncUndoFail();}
	};	
	const failSync = {
		name: "failSync",
		execute: noop,
		undo() {syncUndoFail();}
	};
	
	const works = {
		name: "works",
		execute: noop,
		undo: ()=>"works"
	};
	
	controller.register(works);
	controller.register(failAsync);
	controller.register(failSync);	
	
	await Promise.all(controller.recordBatch([
		{name: "failAsync", params: [1]},
		{name: "failSync", params: [2]},
		{name: "works", params: [3]}
	]));	
	
	try {
		await controller.undo();
	}
	catch(e) {
		const results = e;
	
		assert.ok(results instanceof Array, e);		
		assert.equal(results[0], "works");
		assert.equal(results[1].message, "syncUndoFail is not defined");
		assert.equal(results[2].message, "asyncUndoFail is not defined");
		
		return;
	}	
	
	assert.ok(false, "No error was propagated.")
});

test("Evaluate results of a batch with rejected commands", async ()=>{
	// once available in Node: Promise.allSettled
	const promiseAllSettled = (promises)=>Promise.all(promises.map( (promise)=>(Promise.resolve(promise).then(d=>d, e=>e)) ));
	const controller = new Sample();
	
	const fails = {name: "fails", async execute() {doFail();}, undo: noop}
	const works = {name: "works", execute: noop, undo: noop}

	controller.register(fails);
	controller.register(works);		
	
	const res = await promiseAllSettled( controller.recordBatch([{name: "works"}, {name: "fails"}, {name: "works"}]) );
	 
	assert.equal(res[0], undefined);
	assert.equal(res[1].name, "ReferenceError");
	assert.equal(res[2], undefined);
});


// Error in reset within a command function is NOT propagated
[
	{functionName: "cache", undo: noop, cache: async ()=>{ doFail(); }},
	{functionName: "undo", undo: async ()=>{ doFail(); }, cache: noop}
].forEach(async (testObject)=>{
		
	await test("Error in reset within a "+testObject.functionName+" function is NOT propagated", async ()=>{
		const controller = new Sample();
		const fail = {name: "fail", execute: noop, undo: testObject.undo, cache: testObject.cache};
		
		controller.register(fail);

		try {
			controller.execute("fail").catch((e)=>{ assert.equal(e.message, "doFail is not defined"); return e;});	//Expected to fail, suppress.
			await controller.reset();
		}
		catch(e) {
			assert.ok(false, "An unexpected error was thrown: "+e.message);
		}
	});	
	
});

//"Error in command function while resetting does not leak into new state"
[
	{functionName: "cache", undo: noop, cache: async ()=>{await delay(30); doFail(); }},
	{functionName: "undo", undo: async ()=>{await delay(30); doFail(); }, cache: noop}
].forEach(async (testObject)=>{
	
	await test("Error in "+testObject.functionName+" function while resetting does not leak into new state", async ()=>{
		const execute = new sinon.fake();
		const controller = new Sample();
		const fail = {name: "fail", execute, undo: testObject.undo, cache: testObject.cache};
		const work = {name: "work", execute, undo: noop};
		
		controller.register(fail);
		controller.register(work);

		try {
			await Promise.all([
				controller.execute("work"),
				controller.execute("fail"),
				controller.execute("work"),
				controller.reset()
			]);
		}
		catch(e) {
			//noop
		}
		
		assert.equal(execute.callCount, 0);
	});	
	
});