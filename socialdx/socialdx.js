
/* 
  Toy version of the Connell-Janzen model of forest ecosystem
  diversity. In the model, trees practice social distancing. When
  a tree dies, the replacement cannot be of the same species as
  the departed tree or any of its eight closest neighbors. 
  
  The program accompanies the essay "The Curious Diversity of Forest Trees,"
  published at http://bit-player.org/2020/the-curious-diversity-of-forest-trees in
  August 2020.
    
  Copyright 2020 Brian Hayes. 
  
  MIT license:
  
	Permission is hereby granted, free of charge, to any person obtaining a copy
	of this software and associated documentation files (the "Software"), to deal
	in the Software without restriction, including without limitation the rights
	to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
	copies of the Software, and to permit persons to whom the Software is
	furnished to do so, subject to the following conditions:
	
	The above copyright notice and this permission notice shall be included in all
	copies or substantial portions of the Software.
	
	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
	IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
	FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
	AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
	LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
	OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
	SOFTWARE.

*/

"use strict"

// GLOBALS AND UTILITIES

const twoPi = Math.PI * 2;

let square = n => n * n;

function randomElement(arr) {
	return arr[Math.floor(Math.random() * arr.length)];
}

  // for implementing toroidal coordinate system. always
  // returns a value in [0..m]

function modAdd(a, b, m) {
	let s = a + b;
	if (s < 0) {
		return s + m;
	}
	else if (s >= m) {
		return s - m;
	}
	else {
		return s;
	}
}

  // The square grid of trees is stored as a one-dimensional
  // vector of s^2 elements. Given column and row coordinates
  // within the grid, this returns the corresponding index
  // into the vector.

let colRowToIndex = (c, r, s) => { return c + (r * s) } ;



let state = "idle";  // also "running", "paused"
let stepCount = 0;   // number of tree-replacement events
let timer;           // store ref to setInterval timer (so we can cancel)
let theForest;       // the array of trees
const maxSteps = 500000;   // The limit of human patience. Stop after
                           // this many steps. Pressing resume will start
                           // another run of maxSteps.
const batchSize = 40;   // number of tree replacements per setInterval call
                        // It's a tradeoff between patience and perspicuity.

const timelineOn = false;     // don't gather timeline data
const timelineInterval = 1000;    // every 1,000 steps, take a snapshot for the timeline



// Each tree species is assigned an RGB color. The colors are
// arbitrary, but I tried to avoid anything too garish for the
// forest habitat.

// A mapping in this format will be passed to the constructor function
// for Forest, where its keys will be used to define the set of species
// participating in the model.

// Note that 10 is the minimum number of species to be assured that a
// valid replacement can always be found.

const treeColorMap12 = {
	"aspen"      : "#FA8072",
	"elm"        : "#2c9f2c",
	"maple"      : "#b24242",
	"hickory"    : "#FFA500",
	"hemlock"    : "#FFD700",
	"birch"      : "#51de61",
	"beech"      : "#808000",
	"oak"        : "#84ac39",
	"pine"       : "#b16e6e",
	"chestnut"   : "#b9a76c",
	"poplar"     : "#b351de",
	"spruce"     : "#35659d",
}

const treeColorMap10 = {
	"aspen"      : "#FA8072",
	"elm"        : "#2c9f2c",
	"maple"      : "#b24242",
	"hickory"    : "#FFA500",
	"hemlock"    : "#FFD700",
	"birch"      : "#51de61",
	"beech"      : "#808000",
	"oak"        : "#84ac39",
	"pine"       : "#b16e6e",
	"chestnut"   : "#b9a76c",
}

const treeColorMap9 = {
	"aspen"      : "#FA8072",
	"elm"        : "#2c9f2c",
	"maple"      : "#b24242",
	"hickory"    : "#FFA500",
	"hemlock"    : "#FFD700",
	"birch"      : "#51de61",
	"beech"      : "#808000",
	"oak"        : "#84ac39",
	"pine"       : "#b16e6e",
}

const treeColorMap8 = {
	"aspen"      : "#FA8072",
	"elm"        : "#2c9f2c",
	"maple"      : "#b24242",
	"hickory"    : "#FFA500",
	"hemlock"    : "#FFD700",
	"birch"      : "#51de61",
	"beech"      : "#808000",
	"oak"        : "#84ac39",
}

const treeColorMap4 = {
	"aspen"      : "#FA8072",
	"hemlock"    : "#FFD700",
	"beech"      : "#808000",
	"oak"        : "#84ac39",
}

const canvasBkgdColor = "#e2ded6";   // background ; "putty"



// FRONT END

// constants and structures that help define the user interface

// points to the canvas element from HTML file, and its 2d context
const theCanvas = document.getElementById("the-canvas");
const ctx = theCanvas.getContext("2d");

// two buttons and their event handlers
const startStopButton = document.getElementById("start-stop-button");
startStopButton.onclick = doStartStop;
const resetButton = document.getElementById("reset-button");
resetButton.onclick = doReset;

// for the benefit of those with tiny screens, let's also make the
// canvas itself respond to clicks and taps, as if the button had
// be pressed
theCanvas.addEventListener("click", doStartStop);

// a div where we display a running tally of tree-replacement steps
const stepCountDisplay = document.getElementById("step-counter-display");


// TREES AND THEIR ENEMIES

// constructor for tree objects
// args/fields:
//
//   idx:              linear index within the array of trees in the forest
//   col, row:         position in the forest grid, numbering left to right and top to bottom
//   x, y:             coordinates (in pixels) of the center of a disk to be drawn on the canvas
//   r:                radius of the disk representing a tree (in pixels)
//   species:          a string such as "oak" or "maple"
//   neighborTrees:    array of nine trees centered on 'this'
//   neighborSpecies:  object whose keys are the strings naming the species of all nine neighbors
//   birthdate:        value of stepCount at moment the Tree object was created
// 
// (Note: The birthdate field is not used for anything in this version of the program,
// and it will have a value of 0 in all cases, because Trees are created only at init
// time. But it will be useful later.)

const Tree = function(idx, col, row, x, y, r, species) {
	this.idx = idx;
	this.col = col;
	this.row = row;
	this.x = x;
	this.y = y;
	this.r = r;
	this.species = species;
	this.neighborTrees = [];
	this.neighborSpecies = {};
	this.birthdate = stepCount;
}


  // Find a tree's nine nearest neighbors (including the
  // ego tree itself). We're using toroidal coordinates
  // for this: Left edge is adjacent to right edge, and top
  // wraps around to the bottom.

Tree.prototype.listNeighbors = function(forest) {
	const s = forest.s;     // edge length
	for (let h=-1; h<=1; h++) {
		for (let v=-1; v<=1; v+=1) {
			let col = modAdd(this.col, h, s);
			let row = modAdd(this.row, v, s);
			let idx = colRowToIndex(col, row, s);
			this.neighborTrees.push(forest.trees[idx])
		}
	}
}

  // From the list of neighborTrees, extract the species names
  // and make them the keys of an Object associative dictionary.
  
Tree.prototype.listNeighborSpecies = function(forest) {
	this.neighborSpecies = {};
	for (let t of this.neighborTrees) {
		if (t.species) {
			this.neighborSpecies[t.species] = true;
		}
	}
}


  // Put a tree on the screen as a colored disk.

Tree.prototype.draw = function(colorMap) {
	ctx.fillStyle = colorMap[this.species] || "#ffffff";   // if no species, make it white
	ctx.beginPath();
	ctx.moveTo(this.x, this.y);
	ctx.arc(this.x, this.y, this.r, 0, twoPi, true);
	ctx.fill();

}


// The constructor for a Forest object. The 'gridSize' argument is the 
// number of trees along a side of the square. 'canvasSize' is in pixels.

const Forest = function(gridSize, colorMap, canvasSize) {
	
	this.colorMap = colorMap;
	this.canvasSize = canvasSize;
	
	this.s = gridSize;
	this.N = square(gridSize);     // total trees in array
	
	this.trees = Array(this.N);       // 1d array of Tree objects
	
	  // extract name strings from the color map and store in an array,
	  // for ease of choosing at random
	this.treeNames = Object.keys(colorMap);
	
	  // an associative store that records the number of individuals of each
	  // species. Updated after every time step.
	this.census = {};
	this.treeNames.forEach(sp => this.census[sp] = 0);
	
	const R = canvasSize / (gridSize * 2);            // half the center-to-center distance between adjacent disks
	const r = R - 1;                                  // smaller radius to allow air between disks
	let row = 0;                                      // gather remaining args for Tree constructor
	let col = 0;
	let x = R;
	let y = R;
	
	  // Now we loop through the N sites of the trees vector, building a Tree object
	  // for each one. The 'species' argument for each tree is chosen randomly
	  // for the list of strings in the treeNames array.
	for (let idx = 0; idx < this.N; idx++) {
		this.trees[idx] = new Tree(idx, col, row, x, y, r, randomElement(this.treeNames));
		
		  // calculate col and row for next iteration, incrementing col mod s
		col += 1;
		if (col >= this.s) {
			col = 0;
			row += 1;
		}
		
		  // calculate x,y coords for next disk (using the full radius R, not the
		  // shrunken r.
		x = (2 * R * col) + R;
		y = (2 * R * row) + R;
		
		  // increment the count for the species of tree we've just planted
		this.census[this.trees[idx].species] += 1;
	} // end of Tree-making loop
	
	  // now go back through the array of Trees and for each one list the neighbors
	for (let idx = 0; idx < this.N; idx++) {
		this.trees[idx].listNeighbors(this);
	}
}


// 'replaceTree' is the method called for each basic cycle of the simulation,
// in which a tree dies and another takes its place. This is the inner loop.
// 
// The departing tree is chosen at random; all trees in the forest have equal
// probability. Then we choose another tree as the parent of the replacement.
// This choice is also random, but there's some checking to do before we
// accept it. We catalog of the species of the neighbors of the departing
// tree, along with that tree itself. If the species of the replacement is 
// already present in the neighborhood, the replacement is rejected, and we
// go back for another. If there's no suitable replacement in the entire
// forest, we leave the site vacant (setting the species of the tree at
// the departing site to null).
// 
// The random choice of a replacement is done by choosing a random index within
// the linear vector of trees, and then stepping sequentially through the vector
// until we find a suitable species, or until we've tried all the sites.
// 
// Note that we don't have to destroy the departing tree, or build a new object
// for the replacement. We just change the 'species' field.
// 
// Finally adjust the two affected counts in theCensus, and the step count.

Forest.prototype.replaceTree = function() {
	let departingTree = randomElement(this.trees);
	departingTree.listNeighborSpecies(this);
	let idx = Math.floor(Math.random() * this.N);
	let replacementSpecies = null;
	for (let i=0; i<this.N; i++) {
		let candidate = this.trees[modAdd(idx, i, this.N)];
		if (candidate.species && !departingTree.neighborSpecies[candidate.species]) {
			replacementSpecies = candidate.species;
			break;
		}
	}
	this.census[departingTree.species] -= 1;
	departingTree.species = replacementSpecies;
	if (replacementSpecies) {
		this.census[replacementSpecies] += 1;
	}
	if (timelineOn && (stepCount % timelineInterval === 0)) {
		this.timelineSample();
	}
	stepCount += 1;
}

  // Update the whole array, calling the draw method for every tree.
Forest.prototype.draw = function() {
	this.blankCanvas();
	for (let t of this.trees) {
		t.draw(this.colorMap);
	}	
}

  // Shouldn't be necessary, since the disk-drawing routine always draws a new
  // disk that exactly covers the old one. But the antialiasing process in the
  // browser can leave crud around the edges.

Forest.prototype.blankCanvas = function() {
	ctx.fillStyle = canvasBkgdColor;
	ctx.fillRect(0, 0, this.canvasSize, this.canvasSize);
}


	// The timeline method is meant for gathering data on species abundance
	// as a function of time. Graphs of this data give an overview of fluctuations
	// in population, extinction and monodominance events, etc.
	
	// By default this apparatus is turned off. Turn it on by changing the
	// value of 'timelineOn' to true.
	
	// I have included no procedure for saving the timeline data. You can
	// access it by dumping the value of 'timeline' in the console. (In Chrome,
	// large arrays are truncated or chopped into 100-element pieces. But
	// Firefox has a 'Copy Object' item on the context menu that slurps up
	// the full value.)

Forest.prototype.timelineInit = function() {
	this.timeline = Object.assign({}, this.colorMap);
	for (let t in this.timeline) { this.timeline[t] = []; }
}


	// Add a snapshot to the timeline. 

Forest.prototype.timelineSample = function() {
	for (let name of this.treeNames) {
		this.timeline[name].push(this.census[name]);
	}
}


  // Unique to the social distancing model. Counts pairs of
  // conspecific neighbors -- which are disallowed by the social
  // distancing rules. 
  // 
  // the 'ring' array has the eight neighbors of the center tree,
  // but not the center itself.
  //
  // Not called by default. You might insert this line into the
  // 'replaceTree' method:
  //
  // 	console.log([stepCount, this.countConflicts()]);

Forest.prototype.countConflicts = function() {
	let conflicts = 0;
	for (let t of this.trees) {
		let ctr = t.species;
		let ring = [];
		t.neighborTrees.forEach((val, idx) => { if (idx !== 4) { ring.push(val.species); } });
		for (let sp of ring) {
			if (ctr === sp) {
				conflicts++;
			}
		}
	}
	return conflicts / 2;   // because of double counting
}


// STOP CONDITION

// Run for a fixed number of steps, and pause. The user can resume
// and run for another batch of maxSteps (or interrupt at any time).

function finished() {
	return (stepCount % maxSteps === 0);
}


// CONTROL OF THE MODEL

// It's slow and plodding to update the screen after every single tree
// replacement. Instead we do 'batchSize' replacements, and then redraw.
// The stepcount is also updated only at the end of a batch. And then check
// to see if we're done.

function runBatch() {
	for (let i = 0; i < batchSize; i++) {
		theForest.replaceTree();
	}
	theForest.draw();
	stepCountDisplay.innerHTML = stepCount;
	if (finished()) {
		doStartStop();
	}
}


// Startup. Build the forest with
// 25 trees per row (thus 625 trees total) and 10 species.

function init() {
	theForest = new Forest(25, treeColorMap10, 500);
	theForest.draw();
	if (timelineOn) { theForest.timelineInit(); }
	state = "idle";
}


// Event handler for the Start/Stop button. Also functions as the state
// machine controlling execution. 
// states:
//   'idle'    : not running but ready to run or resume ; this is initial state
//   'running' : running the tree-replacement loop
//   'paused'  : stopped by user or after maxSteps; can be resumed

function doStartStop(e) {
	switch(state) {
		case 'idle': {
	    state = 'running';
	    startStopButton.innerHTML = "Pause";
	    timer = setInterval(runBatch, 0);     // 0 arg means run as fast as possible
	    break;
	  }
	  case 'running': {
	    state = 'paused';
	    clearInterval(timer);
	    startStopButton.innerHTML = "Resume";
	    break;
	  }
	  case 'paused': {
	    state = 'running';
	    startStopButton.innerHTML = "Pause";
	    timer = setInterval(runBatch, 0);
	    break;		  
	  }
	}
}

// The reset button creates a new forest and clears counters, returning
// to 'idle' state and ready to run.

function doReset(e) {
	if (state === 'running') {
		clearInterval(timer);
	}
	state = 'idle';
	stepCount = 0;
	stepCountDisplay.innerHTML = stepCount;
	startStopButton.innerHTML = "Start";
	init();
}

init();   // last thing that happens when page loads
