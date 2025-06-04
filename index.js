import dotenv from 'dotenv';
dotenv.config();

import fetch from 'node-fetch';
import { google } from 'googleapis';
import { auth } from 'google-auth-library';
import fs from 'fs';

const client = auth.fromJSON(JSON.parse(fs.readFileSync('serviceaccount.json', 'utf8')));
client.scopes = ['https://www.googleapis.com/auth/spreadsheets'];
const sheets = google.sheets({ version: 'v4', auth: client });

// this is in the URL of the spreadsheet
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

if(!SPREADSHEET_ID) {
    throw new Error('No spreadsheet ID found in .env');
}

async function appendToSheet(range, values) {
    const response = await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range,
        valueInputOption: 'USER_ENTERED',
        resource: {
            values
        }
    }).catch((err) => {
        console.error(err);
    });

    console.log(values[0]);
}

const getEosBalance = async (account) => {
    return await fetch('https://eos.greymass.com/v1/chain/get_table_rows', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            code: 'eosio.token',
            scope: account,
            table: 'accounts',
            json: true
        })
    }).then((res) => res.json()).then(x => x.rows[0] || {balance:'0.0000 EOS'}).then((b) => parseFloat((b.balance ? b.balance : '0.0000 EOS').split(' ')[0]));
}

const readableNumber = (num) => {
    if (num >= 1e9) {
        return (num / 1e9).toFixed(2) + 'B';
    } else if (num >= 1e6) {
        return (num / 1e6).toFixed(2) + 'M';
    } else if (num >= 1e3) {
        return (num / 1e3).toFixed(2) + 'K';
    }
}

const run = async () => {
    try {
        const [eos, rex, ram, stake] = await Promise.all([
            getEosBalance('eosio'),
            getEosBalance('eosio.rex'),
            getEosBalance('eosio.ram'),
            getEosBalance('eosio.stake')
        ]);

        const lockedEos = await getEosBalance('eosio');

        const percent = (eos + rex + ram + stake) / (2_100_000_000 - lockedEos);

        const date = new Date();
        const readableDate = date.toISOString().split('.')[0].replace('T', '@');
        await appendToSheet('DATA!A1', [[+date, readableDate, eos, readableNumber(eos), parseFloat(percent*100).toFixed(2)]]);
    } catch (err) {
        console.error(err);
    }
};

run();
setInterval(() => {
    run();
}, 1000 * 60 * 60);
