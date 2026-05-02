import React, { useState } from "react";
import { Box, CircularProgress, styled } from "@mui/material";
import { DisplayCode } from "../components/DisplayCode";
import { DisplayCodeResponse } from "../components/DisplayCodeResponse";

import beautify from "js-beautify";
import Button from "../components/Button";
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
export const VOTE_ON_POLL = () => {
  const [requestData, setRequestData] = useState({
    pollName: "myPoll",
    optionIndex: 1,
  });
  const [isLoading, setIsLoading] = useState(false);

  const [responseData, setResponseData] = useState(
    formatResponse(`{
    "type": "VOTE_ON_POLL",
    "timestamp": 1697286687406,
    "reference": "3jU9WpEPAvu9iL3cMfVd2AUmn9AijJRzkGCxVtXfpuUFZubM8AFDcbk5XA9m5AhPfsbMDFkSDzPJnkjeLA5GA59E",
    "fee": "0.01000000",
    "signature": "3QJ1EUvX3rskVNaP3RWvJwb9DsGgHPvneWqBWS62PCcuCj5N4Ei9Tr4nFj4nQeMqMU2qNkVD3Sb59e7iUWkawH3s",
    "txGroupId": 0,
    "approvalStatus": "NOT_REQUIRED",
    "creatorAddress": "Qhxphh7g5iNtxAyLLpPMZzp4X85yf2tVam",
    "voterPublicKey": "C5spuNU1BAHZDEkxF3wnrAPRDuNrVceaDJ6tDKitenko",
    "pollName": "A test poll 3",
    "optionIndex": 1
  }`)
  );


  const codePollName = `
await qortalRequest({
  action: "VOTE_ON_POLL",
  pollName: "${requestData?.pollName}",
  optionIndex: ${requestData?.optionIndex},
});
`.trim();

  const executeQortalRequest = async () => {
    try {
      setIsLoading(true)
      let account = await requestQortal({
        action: "VOTE_ON_POLL",
        pollName: requestData?.pollName,
        optionIndex: requestData?.optionIndex,
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
          <Label>Index option</Label>
          <input
            type="number"
            className="custom-input"
            placeholder="Index option"
            value={requestData.optionIndex}
            name="optionIndex"
            onChange={handleChange}
          />
          <Button
            name="Vote"
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
