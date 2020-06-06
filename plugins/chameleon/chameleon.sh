#!/usr/bin/env bash

BOLD=$(tput bold)
RED=$(tput setaf 1)
YELLOW=$(tput setaf 3)
RESET=$(tput sgr0)

PLUGIN="@alessiodf/core-chameleon"
LOG=$(mktemp /tmp/core-chameleon.XXX.log)

abort ()
{
    rm "${LOG}"
    echo
    exit 0
}

dependencies ()
{
    if [[ -z ${GAWK} ]]; then
        heading "    => Installing GNU Awk"
        ERR=
        if [[ -n ${DEB} ]]; then
            sudo sh -c 'apt-get update && apt-get install -y gawk' >> "${LOG}" 2>>"${LOG}"
            ERR=${?}
        elif [[ -n ${RPM} ]]; then
            sudo sh -c 'yum update -y && yum install -y gawk' >> "${LOG}" 2>>"${LOG}"
            ERR=${?}
        else
            echo "       ${RED}${BOLD}GNU Awk is not installed on this system. Install it manually and try again."
            exit 1
        fi
        if [ "$ERR" != "0" ]; then
            echo "       ${RED}${BOLD}GNU Awk installation failed"
            error
        fi
    fi

    if [[ -z ${TOR} ]]; then
        heading "    => Installing Tor"
        SYS=$([[ -L "/sbin/init" ]] && echo 'SystemD' || echo 'SystemV')
        CONTINUE=
        ERR=
        if [[ -n ${DEB} ]]; then
            sudo sh -c 'apt-get update && apt-get install -y tor' >> "${LOG}" 2>>"${LOG}"
            ERR=${?}
            CONTINUE="yes"
        elif [[ -n ${RPM} ]]; then
            sudo sh -c 'yum update -y && yum install -y tor' >> "${LOG}" 2>>"${LOG}"
            ERR=${?}
            CONTINUE="yes"
       else
            read -rp "       ${RED}${BOLD}Automatic installation of Tor is only available for Debian or RedHat based systems. Continue anyway? [y/N]: ${RESET}" CHOICE
            if [[ ! "${CHOICE}" =~ ^(yes|y|Y) ]]; then
               exit 1
            fi
        fi
        if [ "${CONTINUE}" == "yes" ]; then
            if [ "${ERR}" == "0" ]; then
                if [[ "${SYS}" == "SystemV" ]]; then
                    sudo sh -c 'service tor stop && update-rc.d tor disable' >> "${LOG}" 2>>"${LOG}"
                else
                    sudo sh -c 'systemctl stop tor && systemctl disable tor' >> "${LOG}" 2>>"${LOG}"
                fi
                ERR=${?}
                if [ "${ERR}" != "0" ]; then
                    read -rp "       ${RED}${BOLD}An error occurred while configuring Tor. Continue anyway? [y/N]: ${RESET}" CHOICE
                    if [[ ! "${CHOICE}" =~ ^(yes|y|Y) ]]; then
                        error
                    fi
                fi
            else
                read -rp "       ${RED}${BOLD}An error occurred while installing Tor. Continue anyway? [y/N]: ${RESET}" CHOICE
                if [[ ! "${CHOICE}" =~ ^(yes|y|Y) ]]; then
                   error
                fi
            fi
        fi
    fi
}

disable () {
    heading "    => Disabling Core Chameleon"
    networks
    ESCAPED=${PLUGIN//\//\\\/}
    if grep -q "\"@arkecosystem/core-p2p\": {" ~/.config/"${CORE}"/plugins.js; then
        if grep -q ${PLUGIN} ~/.config/"${CORE}"/plugins.js; then
            if gawk -i inplace "/${ESCAPED}/ {on=1} on && /@/ && !/${ESCAPED}/ {on=0} {if (!on) print}" ~/.config/"${CORE}"/plugins.js 2>> "${LOG}"; then
                heading "    => Disabled for ${CORE}"
                restartprocesses
            else
                echo "       ${RED}${BOLD}Failed to disable Core Chameleon for ${CORE}"
                error
            fi
        else
            echo "       ${RED}${BOLD}Core Chameleon was not present in your Core configuration file.${RESET}"
        fi
    else
        echo "       ${RED}${BOLD}Cannot automatically disable Core Chameleon as this network uses a custom plugins.js format.${RESET}"
        echo "       ${RED}${BOLD}Please follow the manual instructions at: https://github.com/alessiodf/core-chameleon#manual-configuration${RESET}"
    fi
}

heading ()
{
    echo "${RESET}${BOLD}${1}${RESET}"
}

enable () {
    heading "    => Enabling Core Chameleon"
    networks
    ESCAPED=${PLUGIN//\//\\\/}
    if ! grep -q ${PLUGIN} ~/.config/"${CORE}"/plugins.js; then
        if grep -q "\"@arkecosystem/core-p2p\": {" ~/.config/"${CORE}"/plugins.js; then
            if gawk -i inplace "/@arkecosystem\/core-p2p/ {on=1} on && /@/ && !/@arkecosystem\/core-p2p/ {print \"    \\\"${ESCAPED}\\\": {\n        enabled: true,\n    },\"; on=0} {print}" ~/.config/"${CORE}"/plugins.js 2>> "${LOG}"; then
                heading "    => Enabled for ${CORE}"
                if grep -q alessiodf/block-propagator ~/.config/"${CORE}"/plugins.js; then
                    read -rp "       ${BOLD}Core Chameleon supersedes Block Propagator, which is enabled. Disable Block Propagator now? [Y/n]: ${RESET}" CHOICE
                    if [[ ! "${CHOICE}" =~ ^(no|n|N) ]]; then
                        if gawk -i inplace "/@alessiodf\/block-propagator/ {on=1} on && /@/ && !/@alessiodf\/block-propagator/ {on=0} {if (!on) print}" ~/.config/"${CORE}"/plugins.js 2>> "${LOG}"; then
                            heading "    => Disabled Block Propagator for ${CORE}"
                        else
                            echo "       ${RED}${BOLD}Failed to remove Block Propagator for ${CORE}${RESET}"
                        fi
                    else
                        heading "       ${YELLOW}WARNING: The two plugins might conflict!${RESET}"
                    fi
                fi
                restartprocesses
            else
                echo "       ${RED}${BOLD}Failed to enable Core Chameleon for ${CORE}"
                if [ "${1}" == "" ]; then
                    error
                fi
            fi
        else
            echo "       ${RED}${BOLD}Cannot automatically enable Core Chameleon as this network uses a custom plugins.js format.${RESET}"
            echo "       ${RED}${BOLD}Please follow the manual instructions at: https://github.com/alessiodf/core-chameleon#manual-configuration${RESET}"
        fi
    else
        echo "       ${RED}${BOLD}Core Chameleon was already present in your Core configuration file.${RESET}"
    fi
}

error ()
{
    heading "See ${LOG} for more details on the error."
    exit 1
}

install ()
{
    if [[ ! -d ${PLUGINPATH} ]]; then
        heading "    => Installing Core Chameleon"
        if [ "${COREPATH}" != "" ]; then
            cd "${COREPATH}" || exit
            yarn add -W ${PLUGIN} >> "${LOG}" 2>>"${LOG}"
            ERR=${?}
        else
            yarn global add ${PLUGIN} >> "${LOG}" 2>>"${LOG}"
            ERR=${?}
        fi
        if [ "${ERR}" == "0" ]; then
            read -rp "       ${BOLD}Would you like to enable Core Chameleon in your Core configuration file now? [Y/n]: ${RESET}" CHOICE
            if [[ ! "${CHOICE}" =~ ^(no|n|N) ]]; then
                enable 1
            fi
            heading "    => Installation successful"
        else
            echo "       ${RED}${BOLD}Core Chameleon installation failed"
            error
        fi
    else
        if [ "${COREPATH}" != "" ]; then
            echo "${RED}${BOLD}Core Chameleon is already installed for ${COREPATH}."
            echo "Run this script with '--update' instead of '--install' and try again, or specify a different Core installation path.${RESET}"
        else
            echo "${RED}${BOLD}Core Chameleon is already installed for the global ARK Core."
            echo "Run this script with '--update' instead of '--install' and try again, or specify a different Core installation path.${RESET}"
        fi
        exit 1
    fi
}

networks ()
{
    if [ "${#NETWORKS[@]}" == "1" ]; then
        CORE=${NETWORKS[0]}
    else
        heading "       Multiple Core networks found. Please choose the one you want: "
        I=1
        for SELECTION in "${NETWORKS[@]}"; do
            heading "           ${I} => ${SELECTION}"
            ((I++))
        done
        PROMPT="Please enter your choice"
        while true; do
            read -rp "       ${BOLD}${PROMPT}: " CHOICE
            if [[ ${CHOICE} != ?([0-9]) || "${CHOICE}" -lt 1 || "${CHOICE}" -gt ${#NETWORKS[@]} ]]; then
                PROMPT="Invalid choice. Please try again"
            else
                CORE=${NETWORKS[${CHOICE}-1]}
                break
            fi
        done
    fi
}

remove ()
{
    if [[ -d ${PLUGINPATH} ]]; then
        RESTART=
        for SELECTION in "${NETWORKS[@]}"; do
            ESCAPED=${PLUGIN//\//\\\/}
            if grep -q ${PLUGIN} ~/.config/"${SELECTION}"/plugins.js; then
                if gawk -i inplace "/${ESCAPED}/ {on=1} on && /@/ && !/${ESCAPED}/ {on=0} {if (!on) print}" ~/.config/"${SELECTION}"/plugins.js 2>> "${LOG}"; then
                    if [ "${RESTART}" == "" ]; then
                        heading "    => Disabling Core Chameleon"
                    fi
                    heading "    => Disabled for ${SELECTION}"
                    RESTART=1
                else
                    echo "       ${RED}${BOLD}Failed to disable Core Chameleon for ${SELECTION}"
                    error
               fi
            fi
        done
        heading "    => Removing Core Chameleon"
        if [ "${COREPATH}" != "" ]; then
            cd "${COREPATH}" || exit
            yarn remove -W ${PLUGIN} >> "${LOG}" 2>>"${LOG}"
        else
            yarn global remove ${PLUGIN} >> "${LOG}" 2>>"${LOG}"
        fi
        rm -rf "${PLUGINPATH}"
        if [[ -f ~/.bashrc ]] && grep -q "alias chameleon" ~/.bashrc; then
            gawk -i inplace "/alias chameleon/ {on=1} on && !/alias chameleon/ {on=0} {if (!on) print}" ~/.bashrc 2>> "${LOG}"
        fi
        heading "    => Removed Core Chameleon"
        if [ "${RESTART}" == "1" ]; then
            restartprocesses
        fi
    else
        echo "${RED}${BOLD}No Core Chameleon installation found. Run this script with '--install' instead of '--remove' and try again.${RESET}"
    fi
}

restartprocesses ()
{
    readarray -t PROCESSES <<< "$( (pm2 jlist 2>/dev/null | tail -n1 | jq -r '.[] | select(.name | (endswith("-core") or endswith("-forger") or endswith("-relay"))) | .pm2_env | select(.status == "online") | .name' ) 2>> "${LOG}")"
    if [ "${PROCESSES[0]}" != "" ]; then
        for PROCESS in "${PROCESSES[@]}"; do
            read -rp "       ${BOLD}Do you want to restart the ${PROCESS} process now? [y/N]: ${RESET}" CHOICE
            if [[ "${CHOICE}" =~ ^(yes|y|Y) ]]; then
                heading "       Restarting ${PROCESS}"
                pm2 --update-env --silent restart "${PROCESS}"
            fi
        done
    fi
}

update ()
{
    heading "    => Checking for updates"
    if [[ -d ${PLUGINPATH} ]]; then
        LATEST=$(curl "https://registry.npmjs.org/${PLUGIN}" 2> /dev/null | jq -r .'"dist-tags"'.latest)
        CURRENT=$(< "${PLUGINPATH}"/package.json jq -r .version)
        if [[ "${LATEST}" != "${CURRENT}" ]]; then
            read -rp "       ${BOLD}New version ${LATEST} is available. You are using version ${CURRENT}. Update now? [Y/n]: ${RESET}" CHOICE
            if [[ ! "${CHOICE}" =~ ^(no|n|N) ]]; then
                heading "    => Updating Core Chameleon"
                if [ "${COREPATH}" != "" ]; then
                    cd "${COREPATH}" || exit
                    yarn add -W ${PLUGIN}@"${LATEST}" >> "${LOG}" 2>>"${LOG}"
                    ERR=${?}
                else
                    yarn global add ${PLUGIN}@"${LATEST}" >> "${LOG}" 2>>"${LOG}"
                    ERR=${?}
                fi
                if [ "${ERR}" != "0" ]; then
                    echo "       ${RED}${BOLD}Core Chameleon update failed"
                    error
                else
                    heading "    => Updated successfully to ${LATEST}"
                    restartprocesses
                fi
            fi
        else
                heading "    => Core Chameleon is already up to date"
        fi
    else
        echo "${RED}${BOLD}No Core Chameleon installation found. Run this script with '--install' instead of '--update' and try again.${RESET}"
        exit 1
    fi
}

version ()
{
    if [[ -d ${PLUGINPATH} ]]; then
        CURRENT=$(< "${PLUGINPATH}"/package.json jq -r .version)
        heading "    => Core Chameleon version ${CURRENT} is installed"
    else
        echo "${RED}${BOLD}No Core Chameleon installation found. Run this script with '--install' instead of '--version' and try again.${RESET}"
        exit 1
    fi
}

GAWK=$(which gawk 2> /dev/null)
TOR=$(which tor 2> /dev/null)
DEB=$(which apt-get 2> /dev/null)
RPM=$(which yum 2> /dev/null)
ACTION=

trap abort INT

case "${1}" in
    "--enable")
        ACTION="enable"
       ;;
    "--disable")
        ACTION="disable"
       ;;
    "--install")
        ACTION="install"
       ;;
    "--remove")
       ;&
    "--uninstall")
        ACTION="remove"
       ;;
    "--update")
       ;&
    "--upgrade")
        ACTION="update"
       ;;
    "--version")
        ACTION="version"
       ;;
esac

if [[ "${ACTION}" == "install" ]] && { [[ -z ${TOR} ]] || [[ -z ${GAWK} ]]; } && { [[ -n ${DEB} ]] || [[ -n ${RPM} ]]; }; then
    sudo echo -n
fi

heading "Core Chameleon"

if [[ "${ACTION}" == "" ]]; then
    heading "Please specify a valid command. Valid commands are:"
    heading "    => --enable - Enables Core Chameleon in your Core configuration"
    heading "    => --disable - Disables Core Chameleon in your Core configuration"
    heading "    => --install - Installs Core Chameleon"
    heading "    => --remove - Removes Core Chameleon"
    heading "    => --update - Updates Core Chameleon to the latest version"
    heading "    => --version - Prints the currently installed version of Core Chameleon"
    echo
    heading "If you have installed ARK Core from Git or ARK Deployer, also specify the path to ARK Core."
    EXAMPLE="bash ${0##*/} --install"
    if [[ -f ~/.bashrc ]] && grep -q "alias chameleon" ~/.bashrc; then
        EXAMPLE="chameleon --update"
    fi
    heading "For example: ${EXAMPLE} ${HOME}/ark-core"
    exit 0
fi

readarray -t NETWORKS <<< "$(find ~/.config/*-core/*/plugins.js 2>> "${LOG}" | cut -d "/" -f5-6)"
if [ "${NETWORKS[0]}" == "" ]; then
    echo "${RED}${BOLD}No ARK Core configuration found. Install ARK Core and try again.${RESET}"
    exit 1
fi

COREPATH=

if [ "${2}" != "" ] && ! [[ -d ${2}/packages/core ]]; then
    echo "${RED}${BOLD}No ARK Core installation found at ${2}. Check the path and try again.${RESET}"
    exit 1
else
    COREPATH=${2}
fi

if [ "${COREPATH}" == "" ] && ! [[ -d ~/.config/yarn/global/node_modules/@arkecosystem/core ]]; then
    echo "${RED}${BOLD}No global ARK Core installation found. Install ARK Core and try again, or specify a path to ARK Core."
    EXAMPLE="bash ${0##*/}"
    if [[ -f ~/.bashrc ]] && grep -q "alias chameleon" ~/.bashrc; then
        EXAMPLE="chameleon"
    fi
    echo "For example: ${EXAMPLE} --${ACTION} ${HOME}/ark-core ${RESET}"
    exit 1
fi

if [ "${COREPATH}" == "" ]; then
    COREVERSION=$(< ~/.config/yarn/global/node_modules/@arkecosystem/core/package.json jq -r .version)
else
    COREVERSION=$(< "${2}"/packages/core/package.json jq -r .version)
fi

MINVERSION=2.6
if { echo "${COREVERSION}"; echo ${MINVERSION}; } | sort -n -c 2>/dev/null; then
    echo "${RED}${BOLD}Core Chameleon requires ARK Core 2.6. You have version ${COREVERSION}.${RESET}"
    exit 1
fi

PLUGINPATH=~/.config/yarn/global/node_modules/${PLUGIN}
if [ "${COREPATH}" != "" ]; then
    PLUGINPATH=${COREPATH}/node_modules/${PLUGIN}
fi

case "${ACTION}" in
    "install")
       ;&
    "update")
        dependencies
        if [ "${ACTION}" == "update" ]; then
            update
        else
            install
        fi

        if [[ -d ${PLUGINPATH} ]]; then
            if [[ ! -f ${PLUGINPATH}/chameleon.sh ]]; then
                cp "${0}" "${PLUGINPATH}"/chameleon.sh >> "${LOG}" 2> "${LOG}"
            fi
            if [[ -f ~/.bashrc ]] && ! grep -q "alias chameleon" ~/.bashrc; then
                echo "alias chameleon='bash ${PLUGINPATH}/chameleon.sh'" >> ~/.bashrc
                echo
                heading "You may now delete the installation script. To reconfigure, update or remove Core Chameleon in future, type 'chameleon'."
                exec "${BASH}"
            fi
        fi
       ;;
    "enable")
        enable
       ;;
    "disable")
        disable
       ;;
    "remove")
        remove
       ;;
    "version")
        version
       ;;
esac
