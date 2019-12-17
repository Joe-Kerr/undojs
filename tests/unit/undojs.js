const assert = require("assert");
const sinon = require("sinon");
const Sample = require("../../src/Undojs.js").default;

let sample;
const f = ()=>{};
const af = async ()=>{};

function delay(ms) {
	return new Promise((resolve)=>{
		setTimeout(()=>{resolve(null);}, ms);
	});
}

suite("Undojs.js - register");

beforeEach(()=>{
	sample = new Sample();
});

test("register adds command to list", ()=>{
	sample.register({name: "testCommand", execute: f, context: f, undo: f, cache: f});
	
	assert.equal(sample.commands.length, 1);
	assert.deepEqual(Object.keys(sample.commands[0]).sort(), ["cache", "context", "execute", "undo"]);
});

test("register adds command name to list", ()=>{
	sample.register({name: "testCommand", execute: f, context: f, undo: f, cache: f});
	
	assert.equal(Object.keys(sample.commandNames).length, 1);
	assert.deepEqual(sample.commandNames, {testCommand: 0});
});

test("register defaults to null for context and cache", ()=>{
	sample.register({name: "testCommand", execute: f, undo: f});	
	
	assert.equal(sample.commands[0].context, null);
	assert.equal(sample.commands[0].cache, null);
});

test("register throws if mandatory parameters not provided", ()=>{
	let name="", execute=f, undo=f;
	assert.throws(()=>{ sample.register({name, undo}); }, {message: /Insufficient parameters/});
	assert.throws(()=>{ sample.register({name, execute}); }, {message: /Insufficient parameters/});
	assert.throws(()=>{ sample.register({execute, undo}); }, {message: /Insufficient parameters/});
	assert.throws(()=>{ sample.register({name}); }, {message: /Insufficient parameters/});
	assert.throws(()=>{ sample.register({execute}); }, {message: /Insufficient parameters/});
	assert.throws(()=>{ sample.register({undo}); }, {message: /Insufficient parameters/});
});

test("register throws if execute, undo or cache not of type function", ()=>{
	assert.throws(()=>{ sample.register({name: "testCommand", execute: null, undo: f, cache: f}); }, {message: /must be of type function/});
	assert.throws(()=>{ sample.register({name: "testCommand", execute: f, undo: null, cache: f}); }, {message: /must be of type function/});
	assert.throws(()=>{ sample.register({name: "testCommand", execute: f, undo: f, cache: null}); }, {message: /must be of type function/});
});

test("register throws if duplicate name for command", ()=>{
	sample.register({name: "testCommand", execute: f, context: f, undo: f, cache: f});
	assert.throws(()=>{ sample.register({name: "testCommand", execute: f, context: f, undo: f, cache: f}); }, {message: /existing command/});
});


suite("Undojs.js - recordBatch");

beforeEach(()=>{
	sample = new Sample();
});

test("recordBatch creates new empty batch", ()=>{
	sample.execute = ()=>{};
	sample.recordBatch([{name: ""}]);
	
	assert.equal(sample.batch.length, 1);
	assert.deepEqual(sample.batch[0], []);
});

test("recordBatch calls execute with batch idx, name and param of its parameter", ()=>{
	const param = [
		{"name": "testCommand", params: 1},
		{"name": "testCommand", params: 2}
	];	
	sample.execute = new sinon.fake();
	
	sample.recordBatch(param);
	assert.equal(sample.execute.callCount, 2);
	
	assert.deepEqual(sample.execute.firstCall.args[0], {name: "testCommand", batch: 0});
	assert.equal(sample.execute.firstCall.args[1], 1);
	
	assert.deepEqual(sample.execute.secondCall.args[0], {name: "testCommand", batch: 0});
	assert.equal(sample.execute.secondCall.args[1], 2);
});

test("recordBatch passes through return vals of execute calls", ()=>{
	const param = [
		{"name": "testCommand", params: [1]},
		{"name": "testCommand", params: [2]}
	];	
	let count = 0;
	sample.execute = new sinon.fake(()=>{count++; return count});	
	
	const res = sample.recordBatch(param);
	assert.deepEqual(res, [1,2])
});

test("recordBatch throws if parameter not an array", ()=>{
	assert.throws(()=>{ sample.recordBatch("bollocks"); }, {message: /requires an array/});
	assert.throws(()=>{ sample.recordBatch(f()); }, {message: /requires an array/});
	assert.throws(()=>{ sample.recordBatch({f}); }, {message: /requires an array/});
});

test("recordBatch throws if parameter is empty array", ()=>{
	assert.throws(()=>{ sample.recordBatch([]); }, {message: /empty array/});	
});

test("recordBatch throws if elements of paramter not objects", ()=>{
	sample.execute = ()=>{};		
	assert.throws(()=>{ sample.recordBatch([1,2,3]); }, {message: /must be of type object/});
	assert.throws(()=>{ sample.recordBatch(["a"]); }, {message: /must be of type object/});
	assert.throws(()=>{ sample.recordBatch([()=>{}]); }, {message: /must be of type object/});
});
	
test("recordBatch throws if any of the parameter functions does not have name property", ()=>{
	sample.execute = ()=>{};	
	assert.throws(()=>{ sample.recordBatch([{anythingButName: null}]); }, {message: /must have property name/});
});


suite("Undojs.js - execute");

beforeEach(()=>{
	sample = new Sample();
});

test("execute calls the command by name with provided params-array", async ()=>{
	const execute = new sinon.fake();
	sample.commandNames["testCommand"] = 0;
	sample.commands = [{execute, undo: f, cache: f}];	
	await sample.execute("testCommand", [1, true, "abc"]);
	
	assert.equal(execute.callCount, 1);
	assert.equal(execute.firstCall.args[0], 1);
	assert.equal(execute.firstCall.args[1], true);
	assert.equal(execute.firstCall.args[2], "abc");
});

test("execute allows to pass a single, non-array parameter w/o wrapping it in an array", async ()=>{
	const execute = new sinon.fake();
	sample.commandNames["testCommand"] = 0;
	sample.commands = [{execute, undo: f, cache: f}];		
	await sample.execute("testCommand", "abc");
	
	assert.equal(execute.firstCall.args[0], "abc");	
});

test("execute calls the command with an array as the parameter correctly", async ()=>{
	const execute = new sinon.fake();
	sample.commandNames["testCommand"] = 0;
	sample.commands = [{execute, undo: f, cache: f}];		
	await sample.execute("testCommand", [["passing an array"]]);
	
	assert.deepEqual(execute.firstCall.args[0], ["passing an array"]);		
});

test("execute stores the call's parameter/s, return val [and cache value]", async ()=>{
	sample.commandNames["testCommand"] = 0;
	sample.commands = [{execute: ()=>"exec", undo: f, cache: ()=>"cache"}];		
	await sample.execute("testCommand", ["params"]);

	const stack = sample.commandStack;
	
	assert.equal(sample.commandStack.length, 1);
	assert.equal(stack[0].index, 0);
	assert.deepEqual(stack[0].params, ["params"]);
	assert.equal(stack[0].returned, "exec");
	assert.equal(stack[0].cached, "cache");
});

test("execute calls the command's cache function with the call's parameter/s", async ()=>{
	const cache = new sinon.fake();
	sample.commandNames["testCommand"] = 0;
	sample.commands = [{execute: f, undo: f, cache}];	
		
	await sample.execute("testCommand", [1, true, "abc"]);
	
	assert.equal(cache.callCount, 1);
	assert.deepEqual(cache.firstCall.args[0], [1, true, "abc"]);
});

test("execute calls cache function before execute function", async ()=>{
	const execute = new sinon.fake();
	const cache = new sinon.fake();
	sample.commandNames["testCommand"] = 0;
	sample.commands = [{execute, undo: f, cache}];
	
	await sample.execute("testCommand");
	assert.ok(cache.calledBefore(execute));
});

test("execute uses the context provided during register", async ()=>{
	const context = {say() {return "hi";}};
	const execute = function() {return this.say()};	
	const cache = function() {return this.say()};	
	
	sample.commandNames["testCommand"] = 0;
	sample.commands = [{execute, undo: f, cache, context}];
	const expectedContextExecute = await sample.execute("testCommand");
	const expectedContextCache = sample.commandStack[0].cached;
	
	assert.equal(expectedContextExecute, "hi");
	assert.equal(expectedContextCache, "hi");
});

test("execute uses/prioritises the context provided as parameter", async ()=>{
	const regContext = {say() {return "reg";}};
	const callContext = {say() {return "call";}};
	const execute = function() {return this.say()};		
	const cache = function() {return this.say()};	
	
	sample.commandNames["testCommand"] = 0;
	sample.commands = [{execute, undo: f, cache, context: regContext}];
	const expectedContextExecute = await sample.execute({name: "testCommand", context: callContext});
	const expectedContextCache = sample.commandStack[0].cached;
	
	assert.equal(expectedContextExecute, "call");
	assert.equal(expectedContextCache, "call");
});

test("execute temporarily stores a pending cache promise", async ()=>{
	sample.commandNames["testCommand"] = 0;
	sample.commands = [{execute: f, undo: f, cache: af}];

	const res = sample.execute("testCommand");	
	assert.ok("then" in sample.processingCacheState[1]);
	
	await res;
	assert.equal(Object.keys(sample.processingCacheState).length, 0);
});

test("execute bails before execute function if aborting is true", async ()=>{
	const execute = new sinon.fake();
	sample.commandNames["testCommand"] = 0;
	sample.commands = [{execute, undo: f, cache: af}];
	
	sample.aborting = true;
	await sample.execute("testCommand");
	assert.equal(execute.callCount, 0);
});

test("execute throws if called from within undo", async ()=>{
	sample.undoing = true;
	await assert.rejects(async ()=>{ await sample.execute("null"); }, {message: /from within undo process/});
});

test("execute throws if called with an unknown name", async ()=>{
	await assert.rejects(async ()=>{ await sample.execute("bollocks"); }, {message: /Unknown command/});
});

test("execute throws if called with invalid command info", async ()=>{
	await assert.rejects(async ()=>{ await sample.execute({}); }, {message: /name on the command info object/});
	
	await assert.rejects(async ()=>{ await sample.execute({name: "null", context: "bollocks"}); }, {message: /be of type object/});
	
	await assert.rejects(async ()=>{ await sample.execute(); }, {message: /call with /});
});


suite("Undojs.js - undo");

beforeEach(()=>{
	sample = new Sample();
});

test("undo calls a command's undo function with original params, return val [and cache val]", async ()=>{
	const undo = new sinon.fake();
	sample.commands = [{undo}];
	sample.commandStack = [{index: 0, cached: "cache", returned: "return", params: ["param"]}];	

	await sample.undo();
	
	assert.equal(undo.callCount, 1);
	assert.deepEqual(undo.firstCall.args[0], ["param"]);
	assert.equal(undo.firstCall.args[1], "return"); 
	assert.equal(undo.firstCall.args[2], "cache"); 
});

test("undo calls batch commands' undo functions with original params, return val [and cache val]", async ()=>{
	const undo = new sinon.fake();
	sample.commands = [{undo}];	
	sample.commandStack = [
		{id: 1, index: 0, cached: "cache", returned: "return", params: [2]},
		{id: 2, index: 0, cached: "cache", returned: "return", params: [1]},
		{id: 3, index: 0, cached: "cache", returned: "return", params: [0]}
	];	
	sample.batch = [[3,2,1]];
	
	await sample.undo();
	
	assert.equal(undo.callCount, 3);
	["firstCall", "secondCall", "thirdCall"].forEach((call, index)=>{
		const param = index;
		
		assert.deepEqual(undo[call].args[0], [param]);
		assert.equal(undo[call].args[1], "return"); 
		assert.equal(undo[call].args[2], "cache"); 		
	});
});

test("undo returns pending undo if user undoes while another undo is processing", async ()=>{
	const pending = ()=>123;
	sample._enqueuedPendingUndo = new sinon.fake(pending);
	sample.undoing = true;
	sample.commandStack.push(null);
	const res = await sample.undo();
	
	assert.equal(sample._enqueuedPendingUndo.callCount, 1);
	assert.equal(res, 123);
});

test("undo, once done, processes undos on queue", async ()=>{
	const undo = new sinon.fake();
	
	sample.commands = [{undo}, {undo}, {undo}];
	sample.commandStack = [{index: 2}, {index: 1}, {index: 0}];
	sinon.spy(sample, "_asyncProcessPendingUndos");
	
	await Promise.all([sample.undo(), sample.undo(), sample.undo()]);
	
	assert.equal(sample._asyncProcessPendingUndos.callCount, 2);
});

test("undo does not enqueue an undo if there are insufficient commands left", async ()=>{
	const undo = new sinon.fake();
	
	sample.commands = [{undo: f}, {undo: af}];
	sample.commandStack = [{index: 1}, {index: 0}];
	sinon.spy(sample, "_asyncProcessPendingUndos");
	
	await Promise.all([sample.undo(), sample.undo(), sample.undo(), sample.undo(), sample.undo()]);
	
	assert.equal(sample._asyncProcessPendingUndos.callCount, 1);
});

test("undo signals when it is done processing", ()=>{
	return new Promise(async (done)=>{		
		sample.commands = [{undo: af}];
		sample.commandStack = [{index: 0}];	
		
		assert.equal(sample.processingUndoState, null);
		
		const undoState = sample.undo();
		
		assert.ok("then" in sample.processingUndoState);
		assert.notEqual(sample.processingUndoState, true);
		
		sample.processingUndoState.then((res)=>{ assert.ok(res); done(); });
		await undoState;				
	});
});

test("undo returns if command stack empty", async ()=>{
	assert.equal(await sample.undo(), undefined);
});

test("Error in undo function *will not* stop processing other undos in batch", async ()=>{
	const undo = new sinon.fake();
	let failingUndo = async ()=>{failingUndo.callCount++; bollocks();};
	failingUndo.callCount = 0;
	
	sample.commands = [{undo}, {undo: failingUndo}];	
	sample.commandStack = [{id: 1, index: 0}, {id: 2, index: 1}, {id: 3, index: 0}];
	sample.batch = [[1,2,3]];
	
	try {
		await sample.undo();
	}
	catch(e) {
		//noop
	}
	
	assert.equal(sample.commandStack.length, 0);
	assert.equal(sample.batch.length, 0);
	assert.equal(undo.callCount, 2);
	assert.equal(failingUndo.callCount, 1);

});

test("Error in undo function *will* stop processing pending undos", async ()=>{
	const undo = new sinon.fake();
	let failingUndo = async ()=>{failingUndo.callCount++; bollocks();};
	failingUndo.callCount = 0;
	
	sample.commands = [{undo}, {undo: failingUndo}];	
	sample.commandStack = [{id: 1, index: 0}, {id: 2, index: 1}, {id: 3, index: 0}];

	try {
		await Promise.all([
			sample.undo(),
			sample.undo(),
			sample.undo()
		]);
	}
	catch(e) {
		//noop
	}
	
	assert.equal(sample.commandStack.length, 1);
	assert.equal(undo.callCount, 1);
	assert.equal(failingUndo.callCount, 1);	
});

test("Error in undo function resets undo state", async ()=>{
	const undo = ()=>{bollocks();}
	sample.commands = [{undo}];
	sample.commandStack = [{index: 0}];	
	
	assert.equal(sample.undoing, false);
	try {
		await sample.undo();
	}
	catch(e) {
		//noop
	}
	assert.equal(sample.undoing, false);	
});


suite("Undojs.js - reset");

beforeEach(()=>{
	sample = new Sample();
});

test("reset sets aborting state", async ()=>{
	const res = sample.reset();
	assert.equal(sample.aborting, true);
	
	await res;
	assert.equal(sample.aborting, false);
});

test("reset clears execution state", async ()=>{
	sample.pendingUndos = 123;
	sample.undoing = true;
	
	await sample.reset();
	assert.strictEqual(sample.pendingUndos, 0);
	assert.strictEqual(sample.undoing, false);
});

test("reset empties execution data array", async ()=>{
	sample.commandStack = [{returned: ()=>{}}];
	sample.batch = [1];
	sample.undoQueue = [2];
	
	await sample.reset();	
	assert.equal(sample.commandStack.length, 0);
	assert.equal(sample.batch.length, 0);
	assert.equal(sample.undoQueue.length, 0);
});

test("reset preserves references when emptying command stack", async ()=>{
	const ref_commandStack = sample.commandStack;
	
	await sample.reset();	
	assert.equal(ref_commandStack, sample.commandStack);
});

test("reset awaits pending cache calls", async ()=>{
	let isAwaited = false;
	const promise = async ()=>{await delay(10); isAwaited=true;};
	sample.processingCacheState[1] = promise();
	
	const res = sample.reset();
	assert.equal(isAwaited, false);
	
	await res;
	assert.equal(isAwaited, true);
});

test("reset awaits currently running undo", async ()=>{
	let isAwaited = false;
	const promise = async ()=>{await delay(10); isAwaited=true;};
	sample.processingUndoState = promise();
	
	const res = sample.reset();
	assert.equal(isAwaited, false);
	
	await res;
	assert.equal(isAwaited, true);
});

//error in reset within a pending command function resets resetting state
[
	{functionName: "cache"}, 
	{functionName: "undo"}
].forEach(async (testObject)=>{
	const fn = testObject.functionName;
	
	await test("Error in reset within a processing "+fn+" function resets resetting state", async ()=>{		
		if(fn === "cache") {
			sample.processingCacheState[1] = Promise.reject();
		}
		else {
			sample.processingUndoState = Promise.reject();
		}
			
		await sample.reset();

		assert.equal(sample.aborting, false);
		assert.equal(Object.keys(sample.processingCacheState).length, 0);
		assert.equal(sample.processingUndoState, null);
		return;

	});
	
});

test("Error in reset within a cache function does not prevent awaiting a processing undo function", async ()=>{
	let isAwaited = false;
	const promise = async ()=>{await delay(10); isAwaited=true;};
	sample.processingUndoState = promise();
	sample.processingCacheState[1] = Promise.reject();
	
	const res = sample.reset();
	assert.equal(isAwaited, false);
	
	await res;
	assert.equal(isAwaited, true);	
});


suite("Undojs.js - destroy");

beforeEach(()=>{
	sample = new Sample();
});

test("destroy calls reset", async ()=>{
	sample.reset = new sinon.fake();
	
	await sample.destroy();
	assert.equal(sample.reset.callCount, 1);
});

test("destroy empties command defintions", async ()=>{
	sample.reset = ()=>{};
	sample.commandNames = {a: 1};
	sample.commands = [1];
	
	await sample.destroy();
	assert.equal(Object.keys(sample.commandNames).length, 0);
	assert.equal(sample.commands.length, 0);
});