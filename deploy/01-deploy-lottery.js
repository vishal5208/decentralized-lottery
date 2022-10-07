const { network, ethers } = require("hardhat")
const { networkConfig, localChains } = require("../helper-hardhat-config")
const { verify } = require("../utils/verify")

const VRF_SUB_FUND_AMOUNT = ethers.utils.parseEther("1")

// contract deployed to : 0xFe1b34292A941104B8DCC86DA875CD215A609bC9 

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const chainId = network.config.chainId
    console.log(chainId)

    let vrfCoordinatorV2Address, subscritpionId, vrfCoordinatorV2Mock
    if (localChains.includes(network.name)) {
        // grab VRFCoordinatorV2Mock
        vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock")
        vrfCoordinatorV2Address = vrfCoordinatorV2Mock.address

        // for subscritpion id
        const transactionResponse = await vrfCoordinatorV2Mock.createSubscription()
        const transactionReceipt = await transactionResponse.wait(1)
        // this transactionReceipt emits the event, so just get it
        subscritpionId = transactionReceipt.events[0].args.subId

        // we have the subscription, now fund the subscription
        await vrfCoordinatorV2Mock.fundSubscription(subscritpionId, VRF_SUB_FUND_AMOUNT)

        //console.log(vrfCoordinatorV2Address, subscritpionId.toString())
    } else {
        vrfCoordinatorV2Address = networkConfig[chainId]["vrfCoordinatorV2"]
        subscritpionId = networkConfig[chainId]["subscriptionId"]
    }

    const entranceFee = networkConfig[chainId]["entranceFee"]
    const gasLane = networkConfig[chainId]["gasLane"]
    const callbackGasLimit = networkConfig[chainId]["callbackGasLimit"]
    const interval = networkConfig[chainId]["interval"]

    // Constructor parameters order : vrfCoordinatorV2 contract address, entrace fee(depends on which chain on we are),
    // gaseLane, subscriptionId
    const args = [
        vrfCoordinatorV2Address,
        entranceFee,
        gasLane,
        subscritpionId,
        callbackGasLimit,
        interval,
    ]

    const lottery = await deploy("Lottery", {
        from: deployer,
        args: args,
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1,
    })

    if (localChains.includes(network.name)) {
        await vrfCoordinatorV2Mock.addConsumer(subscritpionId, lottery.address)
    }

    // if we are not on localChains then verify the contract
    if (!localChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        log("Verifying...")
        await verify(lottery.address, args)
    }

    log("********************************************************************************")
}

module.exports.tags = ["all", "lottery"]
