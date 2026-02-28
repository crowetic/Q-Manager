import React, { useState } from "react";
import {
  Box,
  ButtonBase,
  CircularProgress,
  MenuItem,
  Select,
  Typography,
  styled,
} from "@mui/material";
import ShortUniqueId from "short-unique-id";

import Button from "../components/Button";
import { useDropzone } from "react-dropzone";
import { privateServices, services } from "../constants";
import { fileToBase64 } from "../utils";
import { openToast } from "../components/openToast";

const uid = new ShortUniqueId({ length: 10 });

export const Label = styled("label")(
  ({ theme }) => `
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 14px;
    display: block;
    margin-bottom: 4px;
    font-weight: 400;
    `
);

export const PUBLISH_QDN_RESOURCE = ({ addNodeByPath, myName, mode, existingFile, updateByPath , groups, selectedGroup}) => {
  const [requestData, setRequestData] = useState({
    service:
      existingFile?.service ||
      (mode === "private" ? "DOCUMENT_PRIVATE" : "DOCUMENT"),
  });

  const { getRootProps, getInputProps } = useDropzone({
    maxFiles: 1,
    onDrop: async (acceptedFiles) => {
      const fileSelected = acceptedFiles[0];
      if (fileSelected) {
        setFile(fileSelected);
      }
    },
  });
  const [isLoading, setIsLoading] = useState(false);
  const [file, setFile] = useState(null);




  const executeQortalRequestGroup = async () => {
    const promise = (async () => {
      try {
        if (!file) throw new Error('Please select a file')
        if (!requestData?.service) throw new Error("Please select a service")
        if(!selectedGroup) throw new Error('Please select a group')
        const findGroup = groups?.find((group)=> group.groupId === selectedGroup)
      if(!findGroup) throw new Error('Cannot find group')
        setIsLoading(true);
  
        const fileExtension = file?.name?.includes(".") ? file.name.split(".").pop() : "";
        const fileTitle =
          file?.name
            ?.split(".")
            .slice(0, -1)
            .join(".")
            .replace(/ /g, "_")
            .slice(0, 20) || "Untitled";
        const filename = fileExtension ? `${fileTitle}.${fileExtension}` : fileTitle;
  
  
        const constructedIdentifier = existingFile?.identifier || `grp-q-manager-858-${uid.rnd()}`;
        const base64File = await fileToBase64(file);
        const encryptedData = await qortalRequest({
          action: "ENCRYPT_QORTAL_GROUP_DATA",
          data64: base64File,
          groupId: selectedGroup
        });

        if(!encryptedData) throw new Error('Unable to encrypt data')
  
        let account = await qortalRequest({
          action: "PUBLISH_QDN_RESOURCE",
          service: existingFile?.service || requestData?.service,
          identifier: constructedIdentifier,
          data64: encryptedData,
          externalEncrypt: true,
         
        });
  
        if (account?.identifier) {
          if (!!existingFile) {
            updateByPath({
              ...existingFile,
              mimeType: file?.type,
              sizeInBytes: file?.size,
            });
            setFile("");
            return true; // Success
          }
  
          addNodeByPath(
            undefined,
            {
              type: "file",
              name: filename,
              mimeType: file?.type,
              sizeInBytes: file?.size,
              qortalName: myName,
              identifier: constructedIdentifier,
              service: requestData?.service,
              group: selectedGroup,
              groupName: findGroup?.groupName
            },
            undefined
          );
  
            
          return true; // Success
        } else {
          throw new Error("Unable to publish the file");
        }
      } catch (error) {
        console.error("Error:", error);
        throw error; // Ensure the error is propagated to the toast
      } finally {
        setIsLoading(false);
      }
    })();
  
    await openToast(promise, {
      loading: "Publishing the file...",
      success: "File published successfully!",
      error: (err) => `Failed to publish: ${err?.error || err?.message || "An unknown error occurred"}`,
    });
  };
  

  const executeQortalRequestPrivate = async () => {
    const promise = (async () => {
      try {
        if (!file) return;
        if (!requestData?.service) throw new Error("Please select a service")
        setIsLoading(true);
  
        const fileExtension = file?.name?.includes(".") ? file.name.split(".").pop() : "";
        const fileTitle =
          file?.name
            ?.split(".")
            .slice(0, -1)
            .join(".")
            .replace(/ /g, "_")
            .slice(0, 20) || "Untitled";
        const filename = fileExtension ? `${fileTitle}.${fileExtension}` : fileTitle;
  
  
        const constructedIdentifier = existingFile?.identifier || `p-q-manager-858-${uid.rnd()}`;
        const base64File = await fileToBase64(file);
        const encryptedData = await qortalRequest({
          action: "ENCRYPT_DATA_WITH_SHARING_KEY",
          data64: base64File,
        });

        if(!encryptedData) throw new Error('Unable to encrypt data')
  
        let account = await qortalRequest({
          action: "PUBLISH_QDN_RESOURCE",
          service: existingFile?.service || requestData?.service,
          identifier: constructedIdentifier,
          data64: encryptedData,
        });
  
        if (account?.identifier) {
          if (!!existingFile) {
            updateByPath({
              ...existingFile,
              mimeType: file?.type,
              sizeInBytes: file?.size,
            });
            setFile("");
            return true; // Success
          }
  
          addNodeByPath(
            undefined,
            {
              type: "file",
              name: filename,
              mimeType: file?.type,
              sizeInBytes: file?.size,
              qortalName: myName,
              identifier: constructedIdentifier,
              service: requestData?.service,
            },
            undefined
          );
  
            
          return true; // Success
        } else {
          throw new Error("Unable to publish the file");
        }
      } catch (error) {
        console.error("Error:", error);
        throw error; // Ensure the error is propagated to the toast
      } finally {
        setIsLoading(false);
      }
    })();
  
    await openToast(promise, {
      loading: "Publishing the file...",
      success: "File published successfully!",
      error: (err) => `Failed to publish: ${err?.error || err?.message || "An unknown error occurred"}`,
    });
  };
  const executeQortalRequest = async () => {
    try {
      setIsLoading(true);
  
      const promise = (async () => {
        if (!requestData?.service) {
          throw new Error("Please select a service");
        }
        const fileExtension = file?.name?.includes(".")
          ? file.name.split(".").pop()
          : "";
        const fileTitle =
          file?.name
            ?.split(".")
            .slice(0, -1)
            .join(".")
            .replace(/ /g, "_")
            .slice(0, 20) || "Untitled";
        const filename = fileExtension
          ? `${fileTitle}.${fileExtension}`
          : fileTitle;
  
        const constructedIdentifier =
          existingFile?.identifier || `q-manager-858-${uid.rnd()}`;
        const account = await qortalRequest({
          action: "PUBLISH_QDN_RESOURCE",
          service: existingFile?.service || requestData?.service,
          identifier: constructedIdentifier,
          file,
          filename,
        });
  
        if (account?.identifier) {
          if (!!existingFile) {
            updateByPath({
              ...existingFile,
              mimeType: file?.type,
              sizeInBytes: file?.size,
            });
            setFile("");
            return;
          }
  
          addNodeByPath(
            undefined,
            {
              type: "file",
              name: filename,
              mimeType: file?.type,
              sizeInBytes: file?.size,
              qortalName: myName,
              identifier: constructedIdentifier,
              service: requestData?.service,
            },
            undefined
          );

          if(!existingFile){
            setFile(null)
          }
          return;
        } else {
          throw new Error("Unable to publish the file");
        }
      })();
  
      await openToast(promise, {
        loading: "Publishing the file...",
        success: "File published successfully!",
        error: (err) => `Failed to publish: ${err.error || err.message || err}`,
      });
    } catch (error) {
      console.error("Error during publishing:", error);
    } finally {
      setIsLoading(false);
    }
  };
  

  return (
    <div
      style={{
        padding: "10px",
      }}
    >
      <div
        className="card"
        style={{
          background: "rgba(0, 0, 0, 0.1)",
        }}
      >
        <div className="message-row">
        
        
          <Label>Service</Label>
          <Select
            disabled={!!existingFile}
            size="small"
            labelId="label-select-category"
            id="id-select-category"
            value={requestData?.service}
            displayEmpty
            onChange={(e) =>
              setRequestData((prev) => {
                return {
                  ...prev,
                  service: e.target.value,
                };
              })
            }
            sx={{
              width: "300px",
            }}
            MenuProps={{
              PaperProps: {
                sx: {
                  backgroundColor: "#1f2530",
                  color: "#ffffff",
                  backgroundImage: "none",
                  maxHeight: 380,
                },
              },
            }}
          >
            <MenuItem disabled value=''>
              <em>No service selected</em>
            </MenuItem>
            {(mode === 'private' ? privateServices : services)?.map((service) => {
              return (
                <MenuItem key={service.name} value={service.name}>
                  {`${service.name} - max ${service.sizeLabel}`}
                </MenuItem>
              );
            })}
          </Select>
          <button
            {...getRootProps()}
            style={{
              width: "150px",
            }}
          >
            <input {...getInputProps()} />
            Select file
          </button>
          <Typography>{file?.name}</Typography>
          {file && (
            <Button
              name="Remove file"
              bgColor="pink"
              
              onClick={() => {
                setFile(null);
              }}
            >
              Remove file
            </Button>
          )}
       
          <Button
            name={!!existingFile ? "Edit Publish" :"Publish"}
            bgColor="#309ed1"
            onClick={()=> {
              if(mode ==='group'){
                executeQortalRequestGroup()
              }
              else if(mode === 'private'){
                executeQortalRequestPrivate()
              } else {
                executeQortalRequest()
              }
            }}
          />
        </div>
      </div>
    </div>
  );
};
