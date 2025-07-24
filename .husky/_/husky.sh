#!/bin/sh

# Husky
# v0.14.0

if [ -z "$husky_skip_init" ]; then
  debug () {
    [ -n "$HUSKY_DEBUG" ] && echo "husky:debug $1"
  }

  readonly hook_name="$(basename "$0")"
  debug "$hook_name hook started..."

  if [ "$HUSKY" = "0" ]; then
    debug "HUSKY env variable is set to 0, skipping hook"
    exit 0
  fi

  if [ -f ~/.huskyrc ]; then
    debug "sourcing ~/.huskyrc"
    . ~/.huskyrc
  fi

  export readonly husky_skip_init=1
  sh -e "$0" "$@"
  exit $?
fi
