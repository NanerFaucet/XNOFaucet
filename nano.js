const bananojs = require("nanojs");
const { Webhook, MessageBuilder } = require('discord-webhook-node');
const hook = new Webhook("https://discord.com/api/webhooks/978243831801729024/ILNMWO33jiDpxYHSsS1g4_NuxVBSo7qf14dHk5njm9AbT4aNJ5zyg0ND4YowOPnoQvBX");
bananojs.setBananodeApiUrl("https://proxy.nanos.cc/proxy");

async function send_nano(addr, amount) {
  try {
    await bananojs.sendNanoWithdrawalFromSeed(
      process.env.seed,
      0,
      addr,
      amount
    );
    const faucetEmbed = new MessageBuilder();
    faucetEmbed.setColor('#ADD8E6');
    faucetEmbed.setTitle('XNODrops Faucet!');
    faucetEmbed.setDescription(`${amount}(XNO) Has been sent to (${addr})!`);
    faucetEmbed.setTimestamp();
    hook.send(faucetEmbed);
    return true;
  } catch (e) {
    return false;
  }
}

async function get_account_history(addr) {
  return await bananojs.getAccountHistory(addr, -1);
}

async function check_bal(addr) {
  let raw_bal = await bananojs.getAccountBalanceRaw(addr);
  let bal_parts = await bananojs.getNanoPartsFromRaw(raw_bal);
  return Number(bal_parts.nano) + Number(bal_parts.nanoshi / 100);
}

async function faucet_dry() {
  let bal = await check_bal(
    "nano_179x6acabhx7s69xdox885uon3t4jwjaytobqdmx3xhrmm63ieoaayokbr47"
  );
  if (bal < 0.02) {
    return true;
  }
  return false;
}

function address_related_to_blacklist(account_history, blacklisted_addresses) {
  if (account_history.history) {
    for (let i = 0; i < account_history.history.length; i++) {
      if (
        account_history.history[i].type == "send" &&
        blacklisted_addresses.includes(account_history.history[i].account)
      ) {
        return true;
      }
    }
  }
  return false;
}

async function is_unopened(address) {
  let account_history = await bananojs.getAccountHistory(address, -1);
  if (account_history.history == "") {
    return true;
  }
  return false;
}

async function receive_deposits() {
  let rep = await bananojs.getAccountInfo(
    await bananojs.getNanoAccountFromSeed(process.env.seed, 0),
    true
  );
  rep = rep.representative;
  if (!rep) {
    //set self as rep if no other set rep
    await bananojs.receiveNanoDepositsForSeed(
      process.env.seed,
      0,
      await bananojs.getNanoAccountFromSeed(process.env.seed, 0)
    );
    return;
  }
  await bananojs.receiveNanoDepositsForSeed(process.env.seed, 0, rep);
}

async function is_valid(address) {
  return await bananojs.getNanoAccountValidationInfo(address).valid;
}

module.exports = {
  send_nano: send_nano,
  faucet_dry: faucet_dry,
  check_bal: check_bal,
  receive_deposits: receive_deposits,
  address_related_to_blacklist: address_related_to_blacklist,
  is_unopened: is_unopened,
  get_account_history: get_account_history,
  is_valid: is_valid
};