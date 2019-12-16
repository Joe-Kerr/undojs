const assert = require("assert");
const sinon = require("sinon");
const Sample = require("../../src/Undojs.js").default;


suite("Undojs.js system tests - general");

let sample;
const noop = ()=>{};

let callstack = [];

let val = 2;

function delay(ms) {
	return new Promise((resolve)=>{
		setTimeout(()=>{resolve(null);}, ms);
	});
}

const add3 = {
	name: "add3",
	execute() {val += 3; callstack.push("add3");},
	undo(p, r, cache) {val -= 3; callstack.push("undo add3");},
	cache() {return val;}
};

const times2 = {
	name: "times2",
	execute() {val *= 2; callstack.push("times2");},
	undo() {val /= 2; callstack.push("undo times2");}
};

const square = {
	name: "square",
	async execute() { 
		await delay(10);
		const c = val*val; 
		val *= val; 
		callstack.push("square"); 
		return c;
	},
	async undo(params, _returned) {
		await delay(10); 
		const returned = 
		await _returned; 
		val /= returned;
		callstack.push("undo square");
	}
};

before(()=>{
	sample = new Sample();
	sample.register(add3);
	sample.register(times2);
	sample.register(square);
});

beforeEach(()=>{
	val = 2;
	callstack = [];
	sample.commandStack = [];
});

test("Forcing next commands to wait for command batch requires awaiting command batch", async ()=>{
	await Promise.all(sample.recordBatch([
			{name: "add3", params: [1]},
			{name: "square", params: [2]},
			{name: "add3", params: [3]}
	]));
	
	await sample.execute("add3", 4);
	
	const callstack = sample.commandStack.map(c=>c.params[0]);
	assert.deepEqual(callstack, [1,3, 2, 4]);	
});

test("Series of [batch] commands are exatcly reversible", async ()=>{
	await Promise.all([
		sample.execute("add3"),
		...sample.recordBatch([
			{name: "add3"},
			{name: "times2"},
			{name: "add3"}
		]),
		sample.execute("times2")
	]);

	await Promise.all([sample.undo(), sample.undo(), sample.undo()]);
	
	assert.deepEqual(callstack, ["add3", "add3", "times2", "add3", "times2", "undo times2", "undo add3", "undo times2", "undo add3", "undo add3"]);
	assert.equal(val, 2);
});

test("Evaluation of individual results requires awaiting each result", async ()=>{
	const calls = [
		sample.execute("add3"),
		sample.execute("add3")
	];	
	assert.notEqual(val, 5);
	assert.notEqual(val, 8);
	
	await Promise.all(calls);
	assert.equal(val, 8);
	
	val = 2;
	
	await sample.execute("add3");
	assert.equal(val, 5);	
	
	await sample.execute("add3");
	assert.equal(val, 8);
});

test("Non-awaited sync commands with mixed presence of cache functions are executed in order", async ()=>{
	const calls = [
		sample.execute("add3"),
		sample.execute("times2")
	];
	
	await Promise.all(calls);
	assert.deepEqual(callstack, ["add3", "times2"]);	
});

test("Async delays in execute and cache functions determine order of command stack", async ()=>{
	const controller = new Sample();
	
	const c0 = {
		name: "c0",
		async execute() {await delay(10); return 0},
		undo: noop,
		async cache() {await delay(30);}
	};	
	
	const c1 = {
		name: "c1",
		execute() {return 1},
		undo: noop,
		async cache() {await delay(30);}
	};	
		
	const c2 = {
		name: "c2",
		async execute() {await delay(10); return 2},
		undo: noop
	};	
	
	const c3 = {
		name: "c3",
		execute() {return 3},
		undo: noop
	};
	
	controller.register(c0);
	controller.register(c1);
	controller.register(c2);
	controller.register(c3);
	
	await Promise.all([
		controller.execute("c0", 0), 
		controller.execute("c1", 1), 
		controller.execute("c2", 2), 
		controller.execute("c3", 3)
	]);
	
	const callstack = controller.commandStack.map(c=>c.params[0]);
	assert.deepEqual(callstack, [3, 2, 1, 0]);
});

test("Non-awaited async commands are not called in order of execution but in order of returning/resolving", async ()=>{
	const calls = [
		sample.execute("add3"),
		sample.execute("square"),
		sample.execute("times2")
	];
	
	await Promise.all(calls);	
	assert.deepEqual(callstack, ["add3", "times2", "square"]);
});

test("Awaited async commands are called in order of execution", async ()=>{
	const calls = [
		sample.execute("add3"),
		await sample.execute("square"),
		sample.execute("times2")
	];
	
	await Promise.all(calls);
	
	assert.deepEqual(callstack, ["add3", "square", "times2"]);
});

test("A pending command cannot be undone", async ()=>{
	const controller = new Sample();
	
	const localStack = [];
	let localVal = 1;
	
	const longRunningExec = {
		name: "longRunningExec",
		async execute() {await delay(50); localVal += 5; localStack.push("execute");},
		undo() {localVal -= 5; localStack.push("undo"); return "longExec"}
	};	
		
	controller.register(longRunningExec);	

	const promises = [
		controller.execute("longRunningExec"),
		controller.undo()
	]
	
	await Promise.all(promises);
	
	assert.equal(localVal, 6);
	assert.deepEqual(localStack, ["execute"]); // undo sees empty command stack and bails
});

test("It is possible but unwise that an undo function calls undo", async ()=>{
	const controller = new Sample();
	
	const commandWithUndo =  {
		name: "commandWithUndo",
		execute() {val += 4;},
		undo() {val -= 4; controller.undo();}
	};
	
	controller.register(add3);
	controller.register(commandWithUndo);
	
	await controller.execute("add3");
	await controller.execute("commandWithUndo");
	
	assert.equal(val, 9);
	
	await controller.undo();
	
	assert.equal(val, 2);
});

test("It is possible but unwise to execute another command from within a command", async ()=>{
	const controller = new Sample();
	
	const commandWithinCommand =  {
		name: "commandWithinCommand",
		async execute() {val += 4; callstack.push("cwithcom"); await controller.execute("add3"); },
		undo() {val -= 4;  callstack.push("undo cwithcom");}
	};
	
	controller.register(add3);
	controller.register(commandWithinCommand);	
	
	await controller.execute("add3");
	await controller.execute("commandWithinCommand");
	
	assert.equal(val, 12);

	controller.undo();
	controller.undo();	
	
	await delay(12);	
	
	assert.equal(val, 5);
});

test("It is possible for a command to execute itself - and break the script with inf recur :(", async ()=>{
	const controller = new Sample();
	
	//detectable
	const recursiveCommand =  {
		name: "recursiveCommand",
		async execute() {val += 4; await controller.execute("recursiveCommand");},
		undo() {val -= 4;}
	};	
	
	//undetectable? Differentiate between a command that calls itself and consecutively calling the same command?
	const chainA = {
		name: "chainA",
		async execute() { await controller.execute("chainB"); },
		undo() {}
	};	
	
	const chainB = {
		name: "chainB",
		async execute() { await controller.execute("chainA"); },
		undo() {}
	};
	
	controller.register(recursiveCommand);	
	controller.register(chainA);	
	controller.register(chainB);	
	
	//await assert.rejects(async ()=>{ await controller.execute("recursiveCommand"); }, {message: /infinite recursion/});
	//await assert.rejects(async ()=>{ await controller.execute("chainA"); }, {message: /infinite recursion/});
});


test("Pending commands do not leak into new state after reset", async ()=>{
	const controller = new Sample();
	
	const testCommand = {
		name: "testCommand",
		async execute() {await delay(30); val+=2; return 1},
		undo: noop,
		async cache() {await delay(30); return 2;}
	};		
	
	const testCommandWOCache = {
		name: "testCommandWOCache",
		async execute() {await delay(30); val+=2; return 1},
		undo: noop
	};		
	
	controller.register(testCommand);
	controller.register(testCommandWOCache);
	
	controller.execute("testCommand");
	controller.execute("testCommandWOCache");
	controller.execute("testCommand");

	const shouldNotChange = val;
	
	controller.reset();	
	
	await delay(1);
	assert.equal(val, shouldNotChange, "Evaluate before commands finish");
	
	await delay(200);
	assert.equal(val, shouldNotChange, "Evaluate after commands finish");
	
});