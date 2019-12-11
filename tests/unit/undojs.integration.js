const assert = require("assert");
const sinon = require("sinon");
const Sample = require("../../src/Undojs.js").default;

suite("Undojs.js - integration tests");

let sample;
const f = ()=>{};
const af = async ()=>{};

function delay(ms) {
	return new Promise((resolve)=>{
		setTimeout(()=>{resolve(null);}, ms);
	});
}

beforeEach(()=>{
	sample = new Sample();
});


test("recordBatch stores batch info for sync function calls", async ()=>{
	sample.register({name: "testCommand", execute: f, undo: f});
	
	sample.execute("testCommand", 1);	
	sample.recordBatch([
		{name: "testCommand", params: [2]},
		{name: "testCommand", params: [3]},
		{name: "testCommand", params: [4]}
	]);
	sample.execute("testCommand", 5);
	
	await delay(10);
	
	const lastBatchOfIds = sample.batch[0];
		
	assert.equal(sample.batch.length, 1);	
	assert.deepEqual(lastBatchOfIds, [2,3,4]);
	
	//console.log(sample.commandStack.map(c=>c.params[0]));
});

test("recordBatch stores batch info for async function calls", async ()=>{
	sample.register({name: "testCommand", execute: af, undo: f});
	
	sample.execute("testCommand", 1);	
	sample.recordBatch([
		{name: "testCommand", params: [2]},
		{name: "testCommand", params: [3]},
		{name: "testCommand", params: [4]}
	]);
	sample.execute("testCommand", 5);
	
	await delay(10);
	
	const lastBatchOfIds = sample.batch[0];	

	assert.equal(sample.batch.length, 1);	
	assert.deepEqual(lastBatchOfIds, [2,3,4]);
});

test("recordBatch stores batch info for consecutive mixed asnyc/sync function calls", async ()=>{
	sample.register({name: "testCommandSync", execute: f, undo: f});
	sample.register({name: "testCommandAsync", execute: af, undo: f});
	
	sample.execute("testCommandSync", 1);	
	sample.recordBatch([
		{name: "testCommandSync", params: [2]},
		{name: "testCommandAsync", params: [3]},
		{name: "testCommandSync", params: [4]}
	]);
	sample.execute("testCommandAsync", 5);
	
	//callstack: 1, (2, 4, 3), 5
	
	await delay(10);
	
	const lastBatchOfIds = sample.batch[0];	
	
	assert.equal(sample.batch.length, 1);	
	assert.deepEqual(lastBatchOfIds, [2, 4, 3]);
});

test("recordBatch only stores those mixed async/sync batch members that are uninterrupted on the callstack", async ()=>{
	sample.register({name: "testCommandSync", execute: f, undo: f});
	sample.register({name: "testCommandAsync", execute: af, undo: f});
	
	sample.execute("testCommandAsync", 1);	
	sample.recordBatch([
		{name: "testCommandSync", params: [2]},
		{name: "testCommandAsync", params: [3]},
		{name: "testCommandSync", params: [4]}
	]);
	sample.execute("testCommandSync", 5);

	//callstack: (2, 4), 5, 1, 3
	
	await delay(10);
	
	const lastBatchOfIds = sample.batch[0];	
	
	assert.equal(sample.batch.length, 1);	
	assert.deepEqual(lastBatchOfIds, [2, 4]);	
});

test("recordBatch stores batch info for consecutive batch calls", async ()=>{
	sample.register({name: "testCommandSync", execute: f, undo: f});
	sample.register({name: "testCommandAsync", execute: af, undo: f});
	
	await Promise.all([
		sample.execute("testCommandAsync", 1),
		...sample.recordBatch([
			{name: "testCommandSync", params: [2]},
			{name: "testCommandAsync", params: [3]},
			{name: "testCommandSync", params: [4]}
		]),
		sample.execute("testCommandSync", 5),
		sample.execute("testCommandAsync", 6),
		...sample.recordBatch([
			{name: "testCommandSync", params: [7]},
			{name: "testCommandAsync", params: [8]},
			{name: "testCommandSync", params: [9]}
		]),
		sample.execute("testCommandSync", 10)
	]);
	
	//callstack: (2, 4), 5, (7, 9), 10, 1, 3, 6, 8
	
	const lastBatchOfIds = sample.batch[1];	
	const secondLastBatchOfIds = sample.batch[0];	
	
	assert.equal(sample.batch.length, 2);	
	assert.deepEqual(lastBatchOfIds, [7, 9]);		
	assert.deepEqual(secondLastBatchOfIds, [2, 4]);		
});


test("undo calls all commands' undo functions if part of a batch", async ()=>{
	const t1 = new sinon.fake(()=>1);
	const t2 = new sinon.fake(()=>2);
	const t3 = new sinon.fake(()=>3);
	const t4 = new sinon.fake(()=>4);
	
	sample.register({name: "t1", execute: f, undo: t1});
	sample.register({name: "t2", execute: f, undo: t2});
	sample.register({name: "t3", execute: f, undo: t3});
	sample.register({name: "t4", execute: f, undo: t4});
	
	sample.execute("t1");
	sample.recordBatch([
		{name: "t2"},
		{name: "t3"}
	]);
	sample.execute("t4");
	
	await delay(10);
	
	sample.undo();
	let res = sample.undo();

	res = await res;
	
	assert.equal(res.length, 2);
	assert.equal(res[0], 3);
	assert.equal(res[1], 2);
});

test("undo calls undo functions in order of commands' order of return - not order of commands' call", async ()=>{
	const t1 = new sinon.fake(()=>1);
	const t2 = new sinon.fake(()=>2);
	const t3 = new sinon.fake(()=>3);
	const t4 = new sinon.fake(()=>4);
	
	sample.register({name: "t1", execute: af, undo: t1});
	sample.register({name: "t2", execute: af, undo: t2});
	sample.register({name: "t3", execute: f, undo: t3});
	sample.register({name: "t4", execute: f, undo: t4});
	
	await Promise.all([
		sample.execute("t1"),
		sample.execute("t2"),
		sample.execute("t3"),
		sample.execute("t4")
	]);
	
	// callstack: t3, t4, t1, t2
	// undo: 2, 1, 4, 3
	
	const undos = await Promise.all([sample.undo(), sample.undo(), sample.undo(), sample.undo()]);
	
	assert.equal(undos[0], 2);
	assert.equal(undos[1], 1);
	assert.equal(undos[2], 4);
	assert.equal(undos[3], 3);	
});

test("undo calls async undo functions sequentially", async ()=>{
	const callstack = [];
	const undostack = [];
	
	const localF = (id)=>{return ()=>{callstack.push(id);}}
	
	const undoT1 = async ()=>{await delay(10); undostack.push("t1"); return 1};
	const undoT2 = async ()=>{await delay(50); undostack.push("t2"); return 2};
	const undoT3 = async ()=>{await delay(99); undostack.push("t3"); return 3};
	
		
	sample.register({name: "t1", execute: localF("t1"), undo: undoT1});
	sample.register({name: "t2", execute: localF("t2"), undo: undoT2});
	sample.register({name: "t3", execute: localF("t3"), undo: undoT3});
	
	await Promise.all([
		sample.execute("t1"),
		sample.execute("t2"),
		sample.execute("t3")
	]);
	
	await Promise.all([sample.undo(), sample.undo(), sample.undo()]);
	
	assert.deepEqual(callstack, ["t1", "t2", "t3"]);
	assert.deepEqual(undostack, callstack.reverse());
});