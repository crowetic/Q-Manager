import React, { useEffect, useState } from "react";
import {
  Button,
  ButtonBase,
  Avatar,
  Box,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  AppBar,
  IconButton,
  Toolbar,
  Select,
  MenuItem,
} from "@mui/material";
import { styled } from "@mui/system";
import { Transition } from "./ShowAction";
import type { TransitionProps } from "@mui/material/transitions/transition";
import CloseIcon from "@mui/icons-material/Close";
import { Label, PUBLISH_QDN_RESOURCE } from "./actions/PUBLISH_QDN_RESOURCE";
import { base64ToUint8Array, uint8ArrayToObject } from "./utils";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import { Spacer } from "./components/Spacer";
import WarningIcon from "@mui/icons-material/Warning";
import { openToast } from "./components/openToast";
import { requestQortal } from "./qapp/request";

const isEncryptedFileNode = (file) => {
  const service =
    typeof file?.service === "string" ? file.service.toUpperCase() : "";
  const encryptionType =
    typeof file?.encryptionType === "string"
      ? file.encryptionType.toLowerCase()
      : "";
  const identifier =
    typeof file?.identifier === "string" ? file.identifier.toLowerCase() : "";

  return (
    Boolean(file?.group || file?.groupId) ||
    encryptionType.includes("private") ||
    encryptionType.includes("group") ||
    service.includes("_PRIVATE") ||
    identifier.startsWith("p-") ||
    identifier.startsWith("pvt-") ||
    identifier.startsWith("grp-")
  );
};

const isGenericPrivateResourceLabel = (value) => {
  const normalized =
    typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!normalized) return true;
  return (
    normalized === "data" ||
    normalized === "file" ||
    normalized === "blob" ||
    normalized === "resource" ||
    normalized === "preview" ||
    normalized === "unknown" ||
    normalized === "untitled" ||
    normalized === "data.bin" ||
    normalized.startsWith("data.")
  );
};

const getDisplayName = (file) =>
  isEncryptedFileNode(file)
    ? (() => {
        const name = typeof file?.name === "string" ? file.name : "";
        const displayName =
          typeof file?.displayName === "string" ? file.displayName : "";
        if (displayName && !isGenericPrivateResourceLabel(displayName)) {
          return displayName;
        }
        if (name && !isGenericPrivateResourceLabel(name)) {
          return name;
        }
        return displayName || name || "";
      })()
    : file?.displayName || file?.name || "";

const getFileSizeBytes = (file) => {
  const candidates = [
    file?.sizeInBytes,
    file?.size,
    file?.fileSize,
    file?.dataSize,
    file?.createdSize,
    file?.totalSize,
  ];
  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return null;
};

const formatBytes = (value) => {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "Unknown";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = -1;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  if (unitIndex < 0) return `${bytes} B`;
  return `${size >= 10 ? size.toFixed(1) : size.toFixed(2)} ${units[unitIndex]}`;
};

export const SelectedFile = ({
  selectedFile,
  setSelectedFile,
  updateByPath,
  myName,
  accountAddress,
  accountPublicKey,
  mode,
  groups,
  selectedGroup,
  addNodeByPath,
}) => {
  const [selectedType, setSelectedType] = useState<string | number>(0);
  const [isExpandMore, setIsExpandMore] = useState(false);
  const [customFileName, setCustomFileName] = useState(
    getDisplayName(selectedFile)
  );
  const fileSizeBytes = getFileSizeBytes(selectedFile);
  useEffect(() => {
    if (selectedFile?.mimeType?.toLowerCase()?.includes("image")) {
      setSelectedType("IMAGE");
    } else {
      setSelectedType("ATTACHMENT");
    }
  }, [selectedFile?.mimeType]);
  useEffect(() => {
    setCustomFileName(getDisplayName(selectedFile));
  }, [
    selectedFile?.identifier,
    selectedFile?.service,
    selectedFile?.displayName,
    selectedFile?.name,
    selectedFile?.filename,
  ]);
  const createEmbedLink = async () => {
    const promise = (async () => {
      try {
        if (mode === "public") {
          await requestQortal({
            action: "CREATE_AND_COPY_EMBED_LINK",
            type: selectedType,
            name: selectedFile.qortalName,
            identifier: selectedFile.identifier,
            service: selectedFile.service,
            mimeType: selectedFile?.mimeType,
            fileName: customFileName,
          });
          return;
        }
        if (mode === "group") {
          await requestQortal({
            action: "CREATE_AND_COPY_EMBED_LINK",
            type: selectedType,
            name: selectedFile.qortalName,
            identifier: selectedFile.identifier,
            service: selectedFile.service,
            mimeType: selectedFile?.mimeType,
            fileName: customFileName,
            encryptionType: "group",
          });
          return;
        }
        const resourcePropertyPayloads = [
          {
            action: "GET_QDN_RESOURCE_PROPERTIES",
            service: selectedFile.service,
            identifier: selectedFile.identifier,
            name: selectedFile.qortalName,
          },
          {
            action: "GET_QDN_RESOURCE_PROPERTIES",
            service: selectedFile.service,
            identifier: selectedFile.identifier,
            qortalName: selectedFile.qortalName,
          },
          {
            action: "GET_QDN_RESOURCE_PROPERTIES",
            service: selectedFile.service,
            identifier: selectedFile.identifier,
          },
        ];

        let responseData: any = null;
        for (const payload of resourcePropertyPayloads) {
          try {
            const response = await requestQortal(payload);
            if (response && typeof response === "object") {
              responseData = response;
              if (responseData?.key || responseData?.sharingKey) break;
            }
          } catch (error) {}
        }

        if (!responseData?.key && !responseData?.sharingKey) {
          const res = await fetch(
            `/arbitrary/${selectedFile.service}/${selectedFile.qortalName}/${selectedFile.identifier}?encoding=base64`
          );
          const base64Data = await res.text();
          const decryptedData = await requestQortal({
            action: "DECRYPT_DATA",
            encryptedData: base64Data,
          });
          const decryptToUnit8Array = base64ToUint8Array(decryptedData);
          responseData = uint8ArrayToObject(decryptToUnit8Array);
        }

        const resolvedKey = responseData?.key || responseData?.sharingKey;
        if (!resolvedKey)
          throw new Error("Could not find key in encrypted data");
        await requestQortal({
          action: "CREATE_AND_COPY_EMBED_LINK",
          type: selectedType,
          name: selectedFile.qortalName,
          identifier: selectedFile.identifier,
          service: selectedFile.service,
          encryptionType: "private",
          key: resolvedKey,
          mimeType: selectedFile?.mimeType,
          fileName: customFileName,
        });
        return true;
      } catch (error) {
        throw error;
      }
    })();
    await openToast(promise, {
      loading: "Downloading resource and fetching link... please wait.",
      success: "Copied successfully!",
      error: (err) => `Failed to copy: ${err.error || err.message || err}`,
    });
  };
  return (
    <div>
      <Dialog
        fullScreen
        open={!!selectedFile}
        onClose={() => setSelectedFile(null)}
        TransitionComponent={
          Transition as React.ComponentType<
            TransitionProps & { children: React.ReactElement }
          >
        }
        PaperProps={{
          style: {
            backgroundColor: "rgb(39, 40, 44)",
            color: "white !important",
          },
        }}
      >
        <AppBar
          sx={{ position: "relative", backgroundColor: "rgb(39, 40, 44)" }}
        >
          <Toolbar>
            <Typography sx={{ ml: 2, flex: 1 }} variant="h6" component="div">
              {getDisplayName(selectedFile)}
            </Typography>
            <IconButton
              edge="start"
              color="inherit"
              onClick={() => setSelectedFile(null)}
              aria-label="close"
            >
              <ExpandMoreIcon
                sx={{
                  fontSize: "35px",
                }}
              />
            </IconButton>
          </Toolbar>
        </AppBar>
        <Box
          sx={{
            padding: "8px",
            display: "flex",
            gap: "10px",
            alignItems: "flex-end",
          }}
        >
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: "5px",
            }}
          >
            <Label>Embed type</Label>
            <Select
              size="small"
              labelId="label-select-category"
              id="id-select-category"
              value={selectedType}
              displayEmpty
              onChange={(e) =>
                setSelectedType((prev) => {
                  return e.target.value;
                })
              }
              sx={{
                width: "175px",
              }}
              MenuProps={{
                PaperProps: {
                  sx: {
                    backgroundColor: "#333333", // Background of the dropdown
                    color: "#ffffff", // Text color
                  },
                },
              }}
            >
              <MenuItem value={0}>
                <em>No type selected</em>
              </MenuItem>
              <MenuItem value="IMAGE">IMAGE</MenuItem>
              <MenuItem value="ATTACHMENT">ATTACHMENT</MenuItem>
            </Select>
          </Box>

          <Button
            onClick={createEmbedLink}
            disabled={!selectedType}
            variant="contained"
          >
            Copy embed link
          </Button>
        </Box>
        <Spacer height="10px" />

        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: "5px",
            padding: "8px",
          }}
        >
          <Label>Filename to show</Label>
          <input
            type="text"
            className="custom-input"
            placeholder="filename"
            value={customFileName}
            onChange={(e) => {
              setCustomFileName(e.target.value);
            }}
            style={{
              background: "transparent",
              color: "white",
              maxWidth: "100%",
            }}
          />
          <Typography sx={{ fontSize: "13px", opacity: 0.82 }}>
            Size:{" "}
            {fileSizeBytes === null ? "Unknown" : formatBytes(fileSizeBytes)}
          </Typography>
          <Spacer height="10px" />
          {mode === "private" && (
            <Box
              sx={{
                width: "100%",
                display: "flex",
                gap: "20px",
                alignItems: "center",
              }}
            >
              <WarningIcon
                sx={{
                  color: "#ff9800",
                }}
              />
              <Typography>
                Encrypted resource! Be careful where you paste this link.
              </Typography>
            </Box>
          )}

          <Spacer height="20px" />

          <Box>
            <ButtonBase onClick={() => setIsExpandMore((prev) => !prev)}>
              <Box
                sx={{
                  padding: "10px",
                  display: "flex",
                  gap: "20px",
                  alignItems: "center",
                }}
              >
                <Typography>Edit publish</Typography>

                {isExpandMore ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </Box>
            </ButtonBase>
            <Spacer height="40px" />
            <Box
              sx={{
                display: isExpandMore ? "block" : "none",
              }}
            >
              <PUBLISH_QDN_RESOURCE
                existingFile={selectedFile}
                myName={myName}
                accountAddress={accountAddress}
                accountPublicKey={accountPublicKey}
                updateByPath={updateByPath}
                mode={mode}
                groups={groups}
                selectedGroup={selectedGroup}
                addNodeByPath={addNodeByPath}
              />
            </Box>
          </Box>
        </Box>
      </Dialog>
    </div>
  );
};
