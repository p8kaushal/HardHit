"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var simulate_1 = require("./src/simulate");
console.log("Running QA Verification...");
(0, simulate_1.runBotSimulation)(500, 'Rookie', 'bowling');
(0, simulate_1.runBotSimulation)(500, 'Medium', 'bowling');
(0, simulate_1.runBotSimulation)(500, 'Hard', 'bowling');
