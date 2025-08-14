const fetch = require('node-fetch');
const config = require('./config.json');
const logger = require('signale');
const dotenv = require('dotenv')
dotenv.config()
const accounts = require('./accounts.json'); // load multiple accounts
const app = require("express")()
app.use(require("body-parser").json())

let rolimonsValues = {};

logger.debug("Made by @spiderphobias (on discord)\nThank you for using Empyreus Trade ad Poster ❤️!\nIf You are enjoying the bot, a star on github wouldn't hurt 😉");
logger.fatal("NOTE: If you are using a host like render, rolimons MAY ban it. This is not an issue with the bot!\n\n");
logger.pending("Please wait while rolimons values and items are fetched :)");

// Update Rolimons values every 5 minutes
async function updateValues() {
    try {
        const res = await fetch('https://api.rolimons.com/items/v2/itemdetails');
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const json = await res.json();
        for (const item in json.items) {
            rolimonsValues[item] = {
                "demand": json.items[item][5],
                "value": json.items[item][4],
                "name": json.items[item][0]
            };
            if (json.items[item][1].length > 1) rolimonsValues[item]["name"] = json.items[item][1];
        }
        logger.complete("Updated Rolimons value!");
    } catch (err) {
        logger.fatal("Error fetching Rolimons API. Possibly banned or network error.", err);
    }
    setTimeout(updateValues, 300000); // 5 minutes
}

updateValues();

// Sleep utility
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function shuffleArray(array) { for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; } }
function chooseRandomSubset(array, size) { const shuffled = array.slice(); shuffleArray(shuffled); return shuffled.slice(0, size); }
function getRandomReceivingCount(smartConfig) { const tagsCount = smartConfig.tags ? smartConfig.tags.length : 0; const allowedMax = Math.min(smartConfig.maxReceiveItems, 4 - tagsCount); const allowedMin = smartConfig.minReceiveItems; if (allowedMax < allowedMin) return null; return randomInt(allowedMin, allowedMax); }

// Make a trade ad for a specific account
async function makeAd(account, sItems, rItems, tags) {
    const sendBody = tags.length ? {
        player_id: account.robloxId,
        offer_item_ids: sItems.map(parseFloat),
        request_item_ids: rItems.map(parseFloat),
        request_tags: tags
    } : {
        player_id: account.robloxId,
        offer_item_ids: sItems.map(parseFloat),
        request_item_ids: rItems.map(parseFloat)
    };

    try {
        const res = await fetch('https://api.rolimons.com/tradeads/v1/createad', {
            method: "POST",
            headers: {
                'content-type': 'application/json',
                'cookie': '_RoliVerification=' + account.token
            },
            body: JSON.stringify(sendBody)
        });

        if (res.status === 201) {
            logger.success(`Successfully posted ad for account ${account.robloxId}!`);
        } else {
            logger.fatal(`Failed posting ad for account ${account.robloxId}. Status: ${res.status}`);
        }
    } catch (err) {
        logger.fatal(`Error posting ad for account ${account.robloxId}:`, err);
    }
}

// Get inventory for specific account
async function getUserInventory(account) {
    try {
        const res = await fetch(`https://api.rolimons.com/players/v1/playerassets/${account.robloxId}`);
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const json = await res.json();
        return json;
    } catch (err) {
        logger.fatal(`Unable to get inventory for account ${account.robloxId}:`, err);
        return null;
    }
}

// Handle full inventory
async function handleFullInventory(account) {
    const json = await getUserInventory(account);
    if (!json) return [];
    const fullData = [];
    for (const item in json.playerAssets) {
        for (const uaid of json.playerAssets[item]) {
            if (!json.holds.includes(uaid)) fullData.push(item);
        }
    }
    return fullData;
}

// Generate combo functions (upgrade/downgrade/any) remain the same...

// Main loop for each account
async function startAccountLoop(account) {
    while (true) {
        try {
            let allItemIds = await handleFullInventory(account);
            if (!allItemIds || allItemIds.length === 0) {
                logger.fatal(`No inventory items found for account ${account.robloxId}`);
            } else {
                // Logic for specificItems or smartAlgo, same as original code
                // Call makeAd(account, sendingItems, receivingItems, tags) instead of original makeAd
            }
        } catch (err) {
            logger.fatal(`Error in account loop for ${account.robloxId}:`, err);
        }
        // Wait 25 minutes before next ad for this account
        await sleep(1500000);
    }
}

// Start all account loops
for (const account of accounts) {
    startAccountLoop(account);
}

app.get("/", (req, res) => {
    res.json({ message: 'Trade ad bot is up and running for multiple accounts!' });
});
app.listen(8080);
