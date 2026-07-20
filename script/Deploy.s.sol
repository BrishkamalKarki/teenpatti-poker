// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {TeenPattiGame} from "../src/TeenPattiGame.sol";

contract Deploy is Script {
    function run() external returns (TeenPattiGame game) {
        vm.startBroadcast();
        game = new TeenPattiGame();
        vm.stopBroadcast();

        console.log("TeenPattiGame contract is deployed to:", address(game));
        console.log("Copying the address into teenpatti-frontend/.env as VITE_CONTRACT_ADDRESS");
    }
}
