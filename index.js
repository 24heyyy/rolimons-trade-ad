const fetch = require('node-fetch');
const config = require('./config.json');
const logger = require('signale');
const dotenv = require('dotenv');
dotenv.config();

const accounts = require('./accounts.json'); // Array of { robloxId, token, smartAlgoConfig, specificItemsConfig }

var app = require("express")();
app.use(require("body-parser").json());

let rolimonsValues = {};

logger.debug("Made by @spiderphobias (on discord)\nThank you for using Empyreus Trade ad Poster ❤️!");

async function updateValues() {
    try {
        const res = await fetch('https://api.rolimons.com/items/v2/itemdetails', {
            method: "GET",
            headers: { 'Content-Type': 'application/json' }
        });
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const json = await res.json();
        for (const item in json.items) {
            rolimonsValues[item] = {
                "demand": json.items[item][5],
                "value": json.items[item][4],
                "name": json.items[item][0]
            };
            if (json.items[item][1].length > 1) {
                rolimonsValues[item]["name"] = json.items[item][1];
            }
        }
        logger.complete("Updated Rolimons value!");
    } catch (err) {
        logger.fatal("Error fetching Rolimons values:", err);
    }

    await sleep(300000);
    updateValues();
}

updateValues();

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function chooseRandomSubset(array, size) {
    const shuffled = array.slice();
    shuffleArray(shuffled);
    return shuffled.slice(0, size);
}

function getRandomReceivingCount(smartConfig) {
    const tagsCount = smartConfig.tags ? smartConfig.tags.length : 0;
    const allowedMax = Math.min(smartConfig.maxReceiveItems, 4 - tagsCount);
    const allowedMin = smartConfig.minReceiveItems;
    if (allowedMax < allowedMin) return null;
    return randomInt(allowedMin, allowedMax);
}

// ... Keep generateUpgradeCombo, generateDowngradeCombo, generateAnyCombo here (same as your original code)

async function getUserInventory(robloxId) {
    const url = `https://api.rolimons.com/players/v1/playerassets/${robloxId}`;
    try {
        const res = await fetch(url, {
            method: "GET",
            headers: { 'Content-Type': 'application/json' }
        });
        if (!res.ok) {
            logger.fatal("Unable to get Rolimons inventory API. Status:", res.status);
            return null;
        }
        return await res.json();
    } catch (err) {
        logger.fatal("Unable to get Roblox inventory API", err);
        return null;
    }
}

async function handleFullInventory(robloxId) {
    const json = await getUserInventory(robloxId);
    if (!json) return [];
    let fullData = [];
    for (const item in json.playerAssets) {
        for (const uaid of json.playerAssets[item]) {
            if (!json.holds.includes(uaid)) fullData.push(item);
        }
    }
    return fullData;
}

async function makeAd(account, sItems, rItems, tags) {
    const sendBody = tags.length >= 1
        ? {
            player_id: account.robloxId,
            offer_item_ids: sItems.map(parseFloat),
            request_item_ids: rItems.map(parseFloat),
            request_tags: tags
        }
        : {
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
            logger.success(`Trade ad posted for account ${account.robloxId}`);
        } else {
            logger.fatal(`Failed to post ad for account ${account.robloxId}, status:`, res.status);
        }
    } catch (err) {
        logger.fatal(`Error posting ad for account ${account.robloxId}:`, err);
    }
}

async function processAccount(account) {
    let allItemIds = await handleFullInventory(account.robloxId);
    if (!allItemIds || allItemIds.length === 0) {
        logger.fatal(`No inventory items found for account ${account.robloxId}`);
        return;
    }

    if (account.specificItemsConfig.enabled) {
        makeAd(account, account.specificItemsConfig.sendingItems, account.specificItemsConfig.receivingItems, account.specificItemsConfig.tags);
    } else if (account.smartAlgoConfig.enabled) {
        // Filtering items based on config
        let sendingList = allItemIds.filter(item => rolimonsValues[item] && !account.smartAlgoConfig.blacklisted.includes(item) && rolimonsValues[item].value >= account.smartAlgoConfig.minItemValueSend);
        let receivingList = Object.keys(rolimonsValues).filter(item => rolimonsValues[item].value >= account.smartAlgoConfig.minItemValueRequest && rolimonsValues[item].demand >= account.smartAlgoConfig.minDemand);

        if (!sendingList.length || !receivingList.length) return;

        const numOfItemsSend = randomInt(account.smartAlgoConfig.minSendItems, Math.min(account.smartAlgoConfig.maxSendItems, 4));
        let combo = null;

        if (account.smartAlgoConfig.upgrade) combo = generateUpgradeCombo(sendingList, receivingList, numOfItemsSend, rolimonsValues, account.smartAlgoConfig);
        else if (account.smartAlgoConfig.downgrade) combo = generateDowngradeCombo(sendingList, receivingList, numOfItemsSend, rolimonsValues, account.smartAlgoConfig);
        else if (account.smartAlgoConfig.any) combo = generateAnyCombo(sendingList, receivingList, rolimonsValues, account.smartAlgoConfig);

        if (combo) {
            const tags = account.smartAlgoConfig.tags || [];
            if (combo.type === "upgrade" && !tags.includes("upgrade")) tags.push("upgrade");
            if (combo.type === "downgrade" && !tags.includes("downgrade")) tags.push("downgrade");
            await makeAd(account, combo.finalSendingItems, combo.finalRequestingItems, tags);
        } else {
            logger.fatal(`No valid combo found for account ${account.robloxId}`);
        }
    }
}

async function postForAllAccounts() {
    for (const account of accounts) {
        try {
            await processAccount(account);
        } catch (err) {
            console.log(`Error with account ${account.robloxId}:`, err);
        }
        // 1 minute gap between each trade ad
        await sleep(60000);
    }
}

setTimeout(() => {
    postForAllAccounts();
}, 5000);

app.get("/", (req, res) => {
    res.json({ message: 'Bot is up and running! https://github.com/Arachnidd/rolimons-trade-ad' });
});

app.listen(8080);
