
/* 
  Stephen P. Hubbell has proposed a theory of "neutral ecological
  drift" to explain the diversity of species observed in many forests,
  especially those of the tropics. He speculates that all the trees
  in a region are equally well adapted to their environment, and
  so the tree growing at any particular site is determined by a
  random process. This program simulates the behavior of a small
  patch of such a forest. (Hubbell explains his ideas in _The Unified 
  Neutral Theory of Biodiversity and Biogeography, 2011, Princeton 
  University Press.)
  
  This version, unlike the one called ecodrift, allows for migration
  into the plot from a reserve area where all species are equally
  abundant. As a result, a species that has become extinct in the 
  study plot can come back to life.
  
  The program accompanies an essay, "The Curious Diversity of Forest Trees,"
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


let state = "idle";  // also "running", "paused"
let stepCount = 0;   // number of tree-replacement events
let timer;           // store ref to setInterval timer (so we can cancel)
let theForest;       // the array of trees
let theCensus;       // the associative object used to keep track of
										 //   how many trees of each species remain in play

const maxSteps = 500000;   // The limit of human patience. Stop after
                           // this many steps. Pressing resume will start
                           // another run of maxSteps.


// Each tree species is assigned an RGB color. The colors are
// arbitrary, but I tried to avoid anything too garish for the
// forest habitat.

const treeColorMap = {
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

// Extract the keys (which are the species names) into an array. 

const treeNames = Object.keys(treeColorMap);


// The timeline code here is meant for gathering data on species abundance
// as a function of time. Graphs of this data give an overview of fluctuations
// in population, extinction and monodominance events, etc.

// By default this apparatus is turned off. Turn it on by changing the
// value of timelineOn to true.

// I have included no procedure for saving the timeline data. You can
// access it by dumping the value of 'timeline' in the console. (In Chrome,
// large arrays are truncated or chopped into 100-element pieces. But
// Firefox has a 'Copy Object' item on the context menu that slurps up
// the full value.)

const timelineOn = false;     // don't gather timeline data

function initTimeline() {                        // object with treenames for keys, and empty arrays for values
	let dict = Object.assign({}, treeColorMap);
	for (let treename in dict) {
		dict[treename] = [];
	}
	return dict;
}

let	timeline = initTimeline();

const timelineInterval = 1000;    // every 1,000 steps, take a snapshot for the timeline


// IMMIGRATION

// In the plain ecodrift model, the forest plot is isolated from
// the rest of the universe. Extinction is forever. Here we postulate
// a reserve or refuge where all species live forever. At intervals,
// a tree migrates from the refuge to our forest plot. Each of the
// 10 species has the same probability of turning up as an immigrant.

let immigrationInterval = 100;        // default value ; a migrant every 100 steps

// A slider in the controls panel lets the user choose an immigration rate
// of 1/N, meaning an immigration event happens every N steps. These are the
// values of N selectable from the slider.

const immigrationIntervalList = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 200, 300, 400, 500, 600, 700, 800, 900, 
                                  1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000];


// FRONT END

// constants and structures that help define the user interface

const canvasSize = 500; // width and height in pixels
const batchSize = 40;   // number of tree replacements per setInterval call
                        // It's a tradeoff between patience and perspicuity.

// points to the canvas element from HTML file, and its 2d context
const theCanvas = document.getElementById("the-canvas");
const ctx = theCanvas.getContext("2d");

const canvasColor = "#e2ded6";   // background ; "putty"

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

// input and output elements for the Immigration Rate
const immSlider = document.getElementById("immigration-slider");
immSlider.onchange = adjustImmigrationRate;                             // triggered when you move the thumb and then let go
immSlider.oninput = adjustImmigrationRate;                              // triggered when you move the thumb
const immOutput = document.getElementById("immigration-slider-output");


// THE MODEL OF NEUTRAL ECODRIFT, WITH IMMIGRATION

// constructor for tree objects
// args/fields:
//
//   col, row:  position in the forest grid, numbering left to right and top to bottom
//   x, y:      coordinates (in pixels) of the center of a disk to be drawn on the canvas
//   r:         radius of the disk representing a tree (in pixels)
//   species:   a string such as "oak" or "maple"
//   birthdate: value of stepCount at moment the Tree object was created
// 
// (Note: The birthdate field is not used for anything in this version of the program,
// and it will have a value of 0 in all cases, because Trees are created only at init
// time. But it will be useful later.)

const Tree = function(col, row, x, y, r, species) {
	this.col = col;
	this.row = row;
	this.x = x;
	this.y = y;
	this.r = r;
	this.species = species;
	this.birthdate = stepCount;
}

// Here we build the initial array of trees. The 'treesPerRow' arg
// is the number of trees along the edge of the square array.

function createForest(treesPerRow) {
	
	const N = square(treesPerRow);     // total trees in array
	const treeVector = Array(N);       // 1d array of Tree objects
	const speciesCounts = {};          // object will become assoc array
	treeNames.forEach(sp => speciesCounts[sp] = 0);      // populate the assoc array
	const R = canvasSize / (treesPerRow * 2);            // half the distance between any two disks
	const r = R - 1;                                     // smaller radius to allow air between disks
	let row = 0;                                         // gather remaining args for Tree constructor
	let col = 0;
	let x = R;
	let y = R;
	
	// Now we loop through the N sites of the treeVector, building a Tree object
	// for each one. The 'species' argument for each tree is chosen randomly
	// for the list of strings supplied in the speciesVector argument.
	for (let idx = 0; idx < N; idx++) {
		treeVector[idx] = new Tree(col, row, x, y, r, randomElement(treeNames));
		
		// calculate col and row for next iteration, incrementing col mod treesPerRow
		col += 1;
		if (col >= treesPerRow) {
			col = 0;
			row += 1;
		}
		
		// calculate x,y coords for next disk (using the full radius R, not the
		// shrunken r.
		x = (2 * R * col) + R;
		y = (2 * R * row) + R;
		
		// increment the count for the species of tree we've just planted
		speciesCounts[treeVector[idx].species] += 1;
	}
	
	// Returns two values, the initialized array of Tree objects and the
	// associative array suitable for counting the remaining stock of
	// each species.
	return [treeVector, speciesCounts];
}


// Where the action is when the program is running. Choose a 'departing' tree,
// that's about to die. All have equal probability. Then choose another tree
// that will determine the species of the 'arriving' replacement. This is also
// selected at random. 
//
// Note that we don't have to destroy the departing tree, or build a new object
// for the replacement. We just change the 'species' field of the departing tree.
// Finally adjust the two affected counts in theCensus, and the step count.
// 
// If stepCount % immigrationInterval === 0, we select the arriving species
// not from the array of trees currently in the forest but from a simple list
// of all tree species in the model. This represents immigration.

// if (timelineOn && (stepCount % timelineInterval === 0)), take a sample

function replaceTree() {
	let departingTree = randomElement(theForest);    // note: type === Tree
	let arrivingSpecies;                             //       type === string
	if (stepCount % immigrationInterval === 0) {
		arrivingSpecies = randomElement(treeNames);
	}
	else {
		arrivingSpecies = randomElement(theForest).species;
	}
	theCensus[departingTree.species] -= 1;
	theCensus[arrivingSpecies] += 1;
	if (timelineOn && (stepCount % timelineInterval === 0)) {
		timelineSample();
	}
	departingTree.species = arrivingSpecies;
	stepCount += 1;
}


// Add a snapshot to the timeline. 

function timelineSample() {
	for (let name of treeNames) {
		timeline[name].push(theCensus[name]);
	}
}



// GRAPHICS

// Shouldn't be necessary, since the disk-drawing routine always draws a new
// disk that exactly covers the old one. But the antialiasing process in the
// browser can leave crud around the edges, which looks cruddy. So roll out
// a fresh background before every redraw.

function blankCanvas() {
	ctx.fillStyle = canvasColor;
	ctx.fillRect(0, 0, canvasSize, canvasSize);
}

// Return the hex color value associated with the given species
// string, or white if the species is not found.

function getTreeColor(species) {
	return treeColorMap[species] || "#ffffff";
}

// Use the fields within the Tree object to draw a colored disk at the
// appropriate point on the canvas.

function drawTree(tree) {
	ctx.fillStyle = getTreeColor(tree.species);
	ctx.beginPath();
	ctx.moveTo(tree.x, tree.y);
	ctx.arc(tree.x, tree.y, tree.r, 0, twoPi, true);
	ctx.fill();
} 

// Loop through all the trees in the forest.

function drawForest() {
	blankCanvas();
	for (let t of theForest) {
		drawTree(t);
	}
}



// STOP CONDITION

// In the plain ecodrift model, there's no point in continuing once the entire
// array has been conquered by a single species; nothing will ever change again.
// That's not the case in a model with immigration from an immortal reserve.
// So instead we run for a fixed number of steps, and pause. The user can resume
// and run for another batch of maxSteps (or interrupt at any time).


function finished() {
	return (stepCount % maxSteps === 0);
}



// CONTROL OF THE MODEL

// It's slow and plodding to update the screen after every single tree
// replacement. Instead we do a batch of 20 replacements, and then redraw.
// The stepcount is also updated only at the end of a batch. And then check
// to see if we're done.

function runBatch() {
	for (let i = 0; i < batchSize; i++) {
		replaceTree();
	}
	drawForest();
	stepCountDisplay.innerHTML = stepCount;
	if (finished()) {
		doStartStop();
	}
}


// Startup. Build the forest and the census object, with
// 25 trees per row (thus 625 trees total) and 10 species.

function init() {
	[theForest, theCensus] = createForest(25);
	drawForest(theForest);
	if (timelineOn) { timeline = initTimeline(); }
	state = "idle";
	immSlider.value = 9;   // set in HTML, but Firefox doesn't pick it up
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


// Event handler for the immigrationRate slider. We are reading a simple
// linear scale of integer values from 0 through 27. The immigrationIntervalList
// serves as a lookup table for the allowed intervals. This value N is then displayed
// as a 1/N rate.

function adjustImmigrationRate(e) {
	let sliderReadout = this.value;
	let interval = immigrationIntervalList[sliderReadout];
	immigrationInterval = interval;
	immOutput.innerHTML = "1/" + immigrationInterval;
}



init();   // last thing that happens when page loads
