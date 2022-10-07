const { ethers } = require("hardhat")

async function enterToLottery() {
    const lottery = await ethers.getContract("Lottery")
    const entranceFee = await lottery.getEntranceFee()
    await lottery.enterToLottery({ value: entranceFee + 0.02 })
    
    console.log("Entered!")
}

enterToLottery()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
