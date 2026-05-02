import React, { useState } from "react";
import { Box, CircularProgress, styled } from "@mui/material";
import { DisplayCode } from "../components/DisplayCode";
import { DisplayCodeResponse } from "../components/DisplayCodeResponse";

import beautify from "js-beautify";
import Button from "../components/Button";
import { OptionsManager } from "../components/OptionsManager";
import { requestQortal } from "../qapp/request";

export const Label = styled("label")(
  ({ theme }) => `
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 14px;
    display: block;
    margin-bottom: 4px;
    font-weight: 400;
    `
);

export const formatResponse = (code) => {
  return beautify.js(code, {
    indent_size: 2, // Number of spaces for indentation
    space_in_empty_paren: true, // Add spaces inside parentheses
  });
};
export const CREATE_POLL = ({myAddress}) => {
  const [isLoading, setIsLoading] = useState(false);

  const [requestData, setRequestData] = useState({
    pollName: "A test poll 3",
    pollDescription: "Test description",
  pollOptions: ['option1', 'option2', 'option3'],
  pollOwnerAddress: myAddress
  });
  const [responseData, setResponseData] = useState(
    formatResponse(`{
      "type": "CREATE_POLL",
      "timestamp": 1697285826221,
      "reference": "3Svgda6JMSoKW8xQreHRWwXfzWUqCG7NXae5bJDcezbGgK2km8VVbRGZXdEA3Q6LSDvG6hfk1xjXBawpBgxSAa2B",
      "fee": "0.01000000",
      "signature": "3jU9WpEPAvu9iL3cMfVd2AUmn9AijJRzkGCxVtXfpuUFZubM8AFDcbk5XA9m5AhPfsbMDFkSDzPJnkjeLA5GA59E",
      "txGroupId": 0,
      "approvalStatus": "NOT_REQUIRED",
      "creatorAddress": "Qhxphh7g5iNtxAyLLpPMZzp4X85yf2tVam",
      "owner": "QbpZL12Lh7K2y6xPZure4pix5jH6ViVrF2",
      "pollName": "A test poll 3",
      "description": "test description",
      "pollOptions": [
          {
              "optionName": "option1"
          },
          {
              "optionName": "option2"
          },
          {
              "optionName": "option3"
          }
      ]
    }`)
  );



  const codePollName = `
await qortalRequest({
  action: "CREATE_POLL",
  pollName: "${requestData?.pollName}",
  pollDescription: "${requestData?.pollDescription}",
  pollOptions: ${JSON.stringify(requestData.pollOptions)},
  pollOwnerAddress: "${requestData?.pollOwnerAddress}"
});
`.trim();

  const executeQortalRequest = async () => {
    try {
      setIsLoading(true)
      let account = await requestQortal({
        action: "CREATE_POLL",
        pollName: requestData?.pollName,
  pollDescription: requestData?.pollDescription,
  pollOptions: requestData.pollOptions,
  pollOwnerAddress: requestData?.pollOwnerAddress
      });

      setResponseData(formatResponse(JSON.stringify(account)));
    } catch (error) {
      setResponseData(formatResponse(JSON.stringify(error)));
      console.error(error);
    } finally {
      setIsLoading(false)
    }
  };
  const handleChange = (e) => {
    setRequestData((prev) => {
      return {
        ...prev,
        [e.target.name]: e.target.value,
      };
    });
  };
  return (
    <div
      style={{
        padding: "10px",
      }}
    >
      <div className="card">
        <div className="message-row">
          <Label>Poll name</Label>
          <input
            type="text"
            className="custom-input"
            placeholder="Poll name"
            value={requestData.pollName}
            name="pollName"
            onChange={handleChange}
          />
           <Label>Poll description</Label>
          <input
            type="text"
            className="custom-input"
            placeholder="Poll description"
            value={requestData.pollDescription}
            name="pollDescription"
            onChange={handleChange}
          />
             <Label>Owner address</Label>
          <input
            type="text"
            className="custom-input"
            placeholder="Owner address"
            value={requestData.pollOwnerAddress}
            name="pollOwnerAddress"
            onChange={handleChange}
          />
          <Label>Options</Label>
         <OptionsManager items={requestData.pollOptions} setItems={(items)=> {
          setRequestData((prev)=> {
            return {
              ...prev,
              pollOptions: items
            }
          })
         }} />
          <Button
            name="Create poll"
            bgColor="#309ed1"
            onClick={executeQortalRequest}
          />
        </div>
      </div>
      <Box
        sx={{
          display: "flex",
          gap: "20px",
        }}
      >
        <Box
          sx={{
            width: "50%",
          }}
        >
          <h3>Request</h3>
          <DisplayCode codeBlock={codePollName} language="javascript" />
        </Box>
        <Box
          sx={{
            width: "50%",
          }}
        >
          <h3>Response</h3>
          {isLoading ? (
            <Box
              sx={{
                display: "flex",
                width: "100%",
                justifyContent: "center",
              }}
            >
              <CircularProgress />
            </Box>
          ) : (
            <DisplayCodeResponse codeBlock={responseData} language="javascript" />
          )}
        </Box>
      </Box>
    </div>
  );
};
