import CircularProgress from '@mui/material/CircularProgress'
import React from 'react'
import styled from 'styled-components'
import Box from '@mui/material/Box'

import { withState } from 'reaclette'
import { Route } from 'react-router-dom'

import { ObjectsByType, Vm, Host } from '../../libs/xapi'

import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemAvatar from '@mui/material/ListItemAvatar'
import ListItemText from '@mui/material/ListItemText'
import ListItemIcon from '@mui/material/ListItemIcon'
import Avatar from '@mui/material/Avatar'
import BeachAccessIcon from '@mui/icons-material/BeachAccess'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'
import Stack from '@mui/material/Stack'
import Icon from '../../components/Icon'
import Grid from '@mui/material/Grid'

interface ParentState {}

interface State {}

interface Props {}

interface ParentEffects {}

interface Effects {}

interface Computed {}

const Container = styled.div`
  display: flex;
  overflow: hidden;
  flex-direction: row;
  align-content: space-between;
  gap: 1.25em;
  background: '#E8E8E8';
`

const Panel = styled.div`
  background: #ffffff;

  margin: 0.5em;
`

const ObjectStatusContainer = styled.div`
  display: flex;
  overflow: hidden;
  flex-direction: row;
  align-content: space-between;
`

const ObjectStatusPanel = styled.div`
  margin: 0.5em;
`
const getHostPowerState = host => {
  const { $metrics } = host
  console.log('getHostPowerState', $metrics ? ($metrics.live ? 'Running' : 'Halted') : 'Unknown')
  return $metrics ? ($metrics.live ? 'Running' : 'Halted') : 'Unknown'
}

const ObjectStatus = withState<State, Props, Effects, Computed, ParentState, ParentEffects>(
  {
    computed: {
      objects: (state, { type }) =>
        type === 'VM'
          ? state.objectsByType
              ?.get(type)
              ?.filter((vm: Vm) => !vm.is_control_domain && !vm.is_a_snapshot && !vm.is_a_template)
          : state.objectsByType?.get(type),
      nTotal: ({ objects }) => objects?.size,
      nActive: ({ objects }, { type }) =>
        (type === 'VM'
          ? objects?.filter((vm: Vm) => vm.power_state === 'Running')
          : objects?.filter((host: Host) => getHostPowerState(host) === 'Running')
        ).size,
      nInactive: ({ nTotal = 0, nActive = 0 }) => nTotal - nActive,
    },
  },
  ({ state: { objects, nTotal, nActive, nInactive }, type }) => {
    if (nTotal === undefined) {
      return <span>No objects</span>
    }

    console.log(typeof nTotal)

    return (
      <ObjectStatusContainer>
        <ObjectStatusPanel>
          <Box sx={{ position: 'relative', display: 'inline-flex' }}>
            <CircularProgress
              variant='determinate'
              value={(nActive * 100) / nTotal}
              sx={{ color: '#00BA34' }}
              size={100}
            />
            <Box
              sx={{
                top: 0,
                left: 0,
                bottom: 0,
                right: 0,
                position: 'absolute',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Typography variant='h6' sx={{ margin: '0.5em', color: '#00BA34' }}>{`${Math.round(
                (nActive * 100) / nTotal
              )}%`}</Typography>
            </Box>
          </Box>
        </ObjectStatusPanel>
        <ObjectStatusPanel>
          <Grid container sx={{ color: '1C1C1C' }}>
            <Grid item xs={12}>
              <Typography sx={{ mb: 2 }} variant='h6' component='div'>
                {type === 'VM' ? 'VMs' : 'Hosts'}
              </Typography>
            </Grid>
            <Grid item xs={1} sx={{ pt: 0.5 }}>
              <Icon icon='circle' color='#00BA34' />
            </Grid>
            <Grid item xs={9}>
              <Typography variant='h6' component='div'>
                Active
              </Typography>
            </Grid>
            <Grid item xs={2}>
              <Typography variant='h6' component='div'>
                {nActive}
              </Typography>
            </Grid>
            <Grid item xs={1} sx={{ pt: 0.5 }}>
              <Icon icon='circle' color='#E8E8E8' />
            </Grid>
            <Grid item xs={9}>
              <Typography variant='h6' component='div'>
                Inactive
              </Typography>
            </Grid>
            <Grid item xs={2}>
              <Typography variant='h6' component='div'>
                {nInactive}
              </Typography>
            </Grid>
            <Grid item xs={10}>
              <Typography variant='h6' component='div' sx={{ mt: 2 }}>
                TOTAL
              </Typography>
            </Grid>
            <Grid item xs={2}>
              <Typography variant='h6' component='div' sx={{ mt: 2 }}>
                {nTotal}
              </Typography>
            </Grid>
          </Grid>
        </ObjectStatusPanel>
      </ObjectStatusContainer>
    )
  }
)

const Dashboard = withState<State, Props, Effects, Computed, ParentState, ParentEffects>({}, () => (
  <Container>
    <Panel>
      <Typography variant='h5' component='div' sx={{ m: 2 }}>
        Status
      </Typography>
      <ObjectStatus type='host' />
      <Divider variant='middle' sx={{ m: 2 }} />
      <ObjectStatus type='VM' />
    </Panel>
  </Container>
))

export default Dashboard
