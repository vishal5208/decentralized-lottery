const { assert, expect } = require("chai")
const { getNamedAccounts, ethers, network } = require("hardhat")
const { localChains } = require("../../helper-hardhat-config")

localChains.includes(network.name)
    ? describe.skip
    : describe("", function () {
          let lottery, lotteryEntranceFee, deployer

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              lottery = await ethers.getContract("Lottery", deployer)
              lotteryEntranceFee = await lottery.getEntranceFee()
          })

          describe("fulfillRandomWords", function () {
              it("Works with Chainlink VRF and Chainlink Keeper , we get random number", async function () {
                  const startingTimeStamp = await lottery.getLatestTimeStamp()
                  const accounts = await ethers.getSigners()

                  console.log("Setting up Listener...")
                  await new Promise(async function (resolve, reject) {
                      lottery.once("WinnerPicked", async function () {
                          console.log("WinnerPicked event fired!")
                          try {
                              const recentWinner = await lottery.getRecentWinner()
                              const lotteryState = await lottery.getLotteryState()
                              const winnerEndingBalance = await accounts[0].getBalance()
                              const endingTimeStamp = await lottery.getLatestTimeStamp()

                              assert.equal(lotteryState.toString(), "0")
                              await expect(lottery.getPlayer(0)).to.be.reverted
                              assert.equal(recentWinner.toString(), accounts[0].address)
                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  winnerStartingBalance.add(lotteryEntranceFee).toString()
                              )
                              assert(endingTimeStamp > startingTimeStamp)

                              resolve()
                          } catch (error) {
                              console.log(error)
                              reject(error)
                          }
                      })

                      // entering to the lottery
                      console.log("Entering to lottery...")
                      const tx = await lottery.enterToLottery({ value: lotteryEntranceFee })
                      console.log("wating....")
                      await tx.wait(1)
                      const winnerStartingBalance = await accounts[0].getBalance()
                  })
              })
          })
      })
