"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var simulate_1 = require("./src/simulate");
console.log('Testing Rookie');
(0, simulate_1.runBotSimulation)(500, 'Easy');
console.log('Testing Medium');
(0, simulate_1.runBotSimulation)(500, 'Medium');
console.log('Testing Hard');
(0, simulate_1.runBotSimulation)(500, 'Hard');
