from brownie import (
    network,
    accounts,
    config,
    interface,
)

LOCAL_BLOCKCHAIN_ENVIRONMENTS = ["mainnet-fork", "ganache", "default"]


def get_account(index=None, id=None):
    if index:
        return accounts[index]
    if network.show_active() in LOCAL_BLOCKCHAIN_ENVIRONMENTS:
        return accounts[0]
    if id:
        return accounts.load(id)
    return accounts.add(config["wallets"]["from_key"])


def get_weth(value, account):
    """
    Mints WETH by depositing ETH.
    """
    ## For interacting with WETH contract:
    # ABI --> The interface provides
    # Address --> We'll insert as the interface parameter
    weth = interface.IWETH(config['networks'][network.show_active()]['weth_token'])
    tx = weth.deposit({"from": account, "value": value})
    tx.wait(1)
    print(f"Received {value} WETH")